using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace BigCopilotLink
{
    /// <summary>
    /// Which browsers may change the game (docs/game-link-api.md, "Approving a browser").
    /// The first write from a browser asks the player once, with the game's own confirm
    /// popup (HudConfirm); an approval is a random token the page keeps and sends back,
    /// valid only from the origin it was issued to. The mod keeps only each token's
    /// SHA-256, with the origin, the page's name for the browser and two dates, in
    /// PlayerPrefs, so an approval outlives the game launch.
    ///
    /// Threading. The approved list is an immutable array swapped whole: the HTTP threads
    /// read it, the main thread replaces it. A pairing request's life (the popup, its
    /// answer, its expiry) happens on the main thread; the HTTP threads only read a
    /// request's state, under <see cref="_gate"/>.
    /// </summary>
    public sealed class ApprovalService
    {
        private const string PrefsKey = "BigCopilotLink.approved";
        private const int MaxApproved = 10;
        private const int IdleDaysBeforeExpiry = 90;
        private const int PopupSeconds = 60;
        /// <summary>
        /// How long an origin waits after a refusal or an expiry: longer each time within
        /// <see cref="StrikeMemoryMinutes"/>, back to the first step after an approval.
        /// </summary>
        private static readonly int[] CooldownSeconds = { 10, 30, 120 };
        private const int StrikeMemoryMinutes = 10;

        /// <summary>A confirm faster than this after the popup opened is a dismissal: the game also confirms on a key.</summary>
        private const double FastConfirmSeconds = 1.0;

        /// <summary>A request's state is answered for this long, then forgotten.</summary>
        private const int RememberRequestMinutes = 10;

        /// <summary>lastUsed is written back at most this often per browser: a write every request is not worth it.</summary>
        private const int TouchEveryMinutes = 60;

        private const int MaxNameLength = 40;
        private const int MaxBodyBytes = 4 * 1024;
        private const int MainThreadWaitMs = 3000;

        private static readonly DateTime UnixEpoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        // The popup's one-second and sixty-second rules run on a monotonic clock: a wall
        // clock the player changes (or that the system corrects) must not stretch them.
        private static readonly System.Diagnostics.Stopwatch Clock = System.Diagnostics.Stopwatch.StartNew();

        // HudConfirmUi keeps the confirm action of the popup it shows in a private field;
        // comparing it with ours tells our popup from another one.
        private static readonly FieldInfo PopupConfirmAction = typeof(global::HudConfirmUi)
            .GetField("_onConfirmAction", BindingFlags.Instance | BindingFlags.NonPublic);

        // Which HudConfirmUi is the one on screen: its container is active, and it is the
        // phone's (showInFullMenu) exactly when the phone is open (HudConfirmUi.ShouldShow).
        private static readonly FieldInfo PopupContainer = typeof(global::HudConfirmUi)
            .GetField("container", BindingFlags.Instance | BindingFlags.NonPublic);
        private static readonly FieldInfo PopupInFullMenu = typeof(global::HudConfirmUi)
            .GetField("showInFullMenu", BindingFlags.Instance | BindingFlags.NonPublic);

        /// <summary>One approved browser. Immutable: a change is a new entry in a new array.</summary>
        private sealed class Entry
        {
            public readonly byte[] Hash;
            public readonly string Origin;
            public readonly string Name;
            public readonly long Created;
            public readonly long LastUsed;

            public Entry(byte[] hash, string origin, string name, long created, long lastUsed)
            {
                Hash = hash;
                Origin = origin;
                Name = name;
                Created = created;
                LastUsed = lastUsed;
            }
        }

        private sealed class Request
        {
            public string Id;
            public string Origin;
            public string Name;
            public string State = "pending";
            public string Token;
            /// <summary>Seconds on <see cref="Clock"/> when the popup opened.</summary>
            public double ShownAt;
            public Action OnConfirm;
        }

        private volatile Entry[] _entries = new Entry[0];

        private readonly object _gate = new object();
        // Under _gate. Written on the main thread, read by /pair/status.
        private readonly Dictionary<string, Request> _requests = new Dictionary<string, Request>(StringComparer.Ordinal);
        private Request _pending;
        // Main thread only.
        private sealed class Strikes
        {
            public int Count;
            public double At;
        }

        private readonly Dictionary<string, Strikes> _strikes = new Dictionary<string, Strikes>(StringComparer.Ordinal);
        private bool _cleared;

        /// <summary>Main thread, at city load: the approvals of earlier launches, the expired ones dropped.</summary>
        public ApprovalService()
        {
            var loaded = Load();
            var now = NowSeconds();
            var kept = loaded.FindAll(e => !Idle(e, now));
            _entries = kept.ToArray();
            if (kept.Count != loaded.Count) Save();
        }

        /// <summary>Main thread, on unload. A request still open ends as expired; the approvals stay stored.</summary>
        public void Clear()
        {
            _cleared = true;
            lock (_gate)
            {
                if (_pending != null) _pending.State = "expired";
                _pending = null;
                _requests.Clear();
            }
        }

        // ---- the token check (any thread) --------------------------------------------

        /// <summary>
        /// True when the request carries a token approved for its own origin. Any thread.
        /// The hash compare takes the same time whatever it finds.
        /// </summary>
        public bool IsApproved(HttpListenerRequest request)
        {
            var token = BearerToken(request.Headers["Authorization"]);
            if (token == null) return false;
            var hash = Sha256(token);
            var origin = OriginOf(request);
            var now = NowSeconds();

            foreach (var entry in _entries)
            {
                if (!FixedTimeEquals(entry.Hash, hash)) continue;
                if (!string.Equals(entry.Origin, origin, StringComparison.Ordinal) || Idle(entry, now)) return false;
                // The first use always goes back (an approval in use is never "never
                // used" to the eviction), later ones at most once an hour.
                if (entry.LastUsed == entry.Created || now - entry.LastUsed > TouchEveryMinutes * 60L)
                {
                    var used = entry;
                    MainThreadDispatcher.Enqueue(delegate { Touch(used, NowSeconds()); });
                }
                return true;
            }
            return false;
        }

        private static string BearerToken(string authorization)
        {
            if (authorization == null) return null;
            var text = authorization.Trim();
            const string scheme = "Bearer ";
            if (text.Length <= scheme.Length ||
                !string.Equals(text.Substring(0, scheme.Length), scheme, StringComparison.OrdinalIgnoreCase))
                return null;
            var token = text.Substring(scheme.Length).Trim();
            return token.Length == 0 ? null : token;
        }

        /// <summary>The request's origin as the bucket its approval lives in: "" for none (curl, the CLI watcher).</summary>
        internal static string OriginOf(HttpListenerRequest request)
        {
            var origin = request.Headers["Origin"];
            return string.IsNullOrEmpty(origin) ? "" : origin.Trim().ToLowerInvariant();
        }

        // ---- POST /pair/request (HTTP thread, then the main thread) -----------------

        public WriteAnswer HandleRequest(HttpListenerRequest request)
        {
            var origin = OriginOf(request);
            // A page off the allowlist could not read the answer, but it could still put
            // a popup in front of the player.
            if (origin.Length > 0 && !LinkHttpServer.IsAllowedOrigin(origin)) return WriteAnswer.Error(403, "origin_not_allowed");

            string text;
            if (!WriteService.TryReadBody(request, MaxBodyBytes, out text)) return WriteAnswer.Error(413, "too_large");
            string name;
            try
            {
                if (text == null) throw new BadRequestException("the body is not UTF-8");
                var root = text.Trim().Length == 0 ? new Dictionary<string, object>() : JsonReader.Obj(JsonReader.Parse(text), "body");
                name = CleanName(JsonReader.Str(root, "name", "body", false));
            }
            catch (BadRequestException e)
            {
                return WriteAnswer.BadRequest(e.Message);
            }

            // The popup and every decision about it belong to the main thread. A job the
            // main thread has not started in three seconds is withdrawn, so no popup can
            // appear for a request the page was told failed.
            var state = 0; // 0 pending, 1 running, 2 withdrawn
            Task<WriteAnswer> task;
            try
            {
                task = MainThreadDispatcher.RunOnMainThread(delegate
                {
                    if (Interlocked.CompareExchange(ref state, 1, 0) != 0) return default(WriteAnswer);
                    return StartOnMainThread(origin, name);
                });
                if (!task.Wait(MainThreadWaitMs))
                {
                    if (Interlocked.CompareExchange(ref state, 2, 0) == 0) return WriteAnswer.Error(503, "busy");
                    task.Wait();
                }
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("a pairing request could not reach the main thread: " + e.GetType().Name);
                return WriteAnswer.Error(503, "main_thread_unavailable");
            }
            return task.Result;
        }

        /// <summary>
        /// The page's name for the browser, as the popup may show it. A whitelist, since
        /// every blacklist leaked: TextMeshPro reads tags, decodes literal \uXXXX escapes
        /// whatever the text (PopulateTextProcessingArray), and Unicode has bidirectional
        /// and invisible characters in several planes. Only ASCII letters, digits, space
        /// and . , - ( ) / + are kept; runs of spaces become one; at most 39 characters, so
        /// the locale-key suffix (StartOnMainThread) keeps it within 40. Nothing left is
        /// "" here; StartOnMainThread words that.
        /// </summary>
        private static string CleanName(string name)
        {
            var sb = new StringBuilder();
            if (name != null)
            {
                foreach (var ch in name)
                {
                    var keep = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') ||
                               ch == ' ' || ch == '.' || ch == ',' || ch == '-' || ch == '(' || ch == ')' ||
                               ch == '/' || ch == '+';
                    if (!keep) continue;
                    if (ch == ' ' && (sb.Length == 0 || sb[sb.Length - 1] == ' ')) continue;
                    sb.Append(ch);
                }
            }
            var clean = sb.ToString().Trim();
            if (clean.Length > MaxNameLength - 1) clean = clean.Substring(0, MaxNameLength - 1).Trim();
            return clean;
        }

        private WriteAnswer StartOnMainThread(string origin, string name)
        {
            if (_cleared) return WriteAnswer.Error(503, "main_thread_unavailable");
            var now = Clock.Elapsed.TotalSeconds;

            lock (_gate)
            {
                if (_pending != null) return Throttled(PopupSeconds - (now - _pending.ShownAt));
            }
            var wait = CooldownLeft(origin, now);
            if (wait > 0) return Throttled(wait);

            // HudConfirm.Show confirms unseen when no popup UI is registered, and drops
            // the call without a callback when one is already open: refuse both first.
            // Over the city map no popup is known to show (the map swaps the camera's
            // culling mask and its own UI in), so the page asks again once it is closed.
            if (global::HudConfirm.onShow == null || global::CityMap.IsOpen) return CannotPair("no_ui");
            if (global::HudConfirm.isOpen) return CannotPair("popup_open");
            if (SaveGameManager.SavingGameInProgress) return CannotPair("saving");
            if (!SaveService.CanSaveNow()) return CannotPair(SaveService.RefusalReason());
            if (SaveGameManager.Current == null) return CannotPair("other");

            // A name that is itself a localisation key would show as the game's text for
            // that key: change it so it cannot.
            // Nameless: a browser page is "a browser"; a program with no origin is already
            // "a program on this computer" and gets no name at all.
            if (name.Length == 0 && origin.Length > 0) name = "a browser";
            if (name.Length > 0 && Localizor.LocalizorManager.IsLocalizedKey(name)) name = name + "_";
            var request = new Request { Id = NewId(), Origin = origin, Name = name, ShownAt = now };
            request.OnConfirm = delegate { OnConfirm(request); };

            try
            {
                var header = Localizor.LocalizorManager.Localize("bigcopilotlink_pair_title", null);
                var body = origin.Length == 0
                    ? (name.Length == 0
                        ? Localizor.LocalizorManager.Localize("bigcopilotlink_pair_body_local_unnamed", null)
                        : Localizor.LocalizorManager.Localize("bigcopilotlink_pair_body_local", new { name = name }))
                    : Localizor.LocalizorManager.Localize("bigcopilotlink_pair_body", new { origin = origin, name = name });
                global::HudConfirm.Show(header, body, request.OnConfirm, delegate { OnCancel(request); },
                    "bigcopilotlink_pair_allow", "bigcopilotlink_pair_deny", false, false);
            }
            catch (Exception e)
            {
                LinkMod.LogError("could not show the approval popup: " + e);
                return CannotPair("other");
            }

            // HudConfirmUi.Show sets isOpen only when one of the popups agreed to show
            // (ShouldShow); none did means nobody sees it and no answer will ever come.
            if (!global::HudConfirm.isOpen) return CannotPair("no_ui");

            lock (_gate)
            {
                _pending = request;
                _requests[request.Id] = request;
            }

            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("requestId", request.Id);
            w.Prop("expiresIn", PopupSeconds);
            w.EndObject();
            return new WriteAnswer(202, w.ToString());
        }

        private static WriteAnswer Throttled(double seconds)
        {
            var retry = (int)Math.Ceiling(seconds);
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", "throttled");
            w.Prop("retryAfter", retry < 1 ? 1 : retry);
            w.EndObject();
            return new WriteAnswer(429, w.ToString());
        }

        private static WriteAnswer CannotPair(string reason)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", "cannot_pair");
            w.Prop("reason", reason);
            w.EndObject();
            return new WriteAnswer(409, w.ToString());
        }

        // ---- the popup's answers (main thread) ---------------------------------------

        private void OnConfirm(Request request)
        {
            if (_cleared) return;
            lock (_gate)
            {
                if (request.State != "pending") return;
            }

            // The game confirms on its Confirm key too; a confirm this soon after the
            // popup opened is more likely a key pressed for something else than a
            // decision, so it counts as a dismissal. One after the deadline is too late:
            // the pump may simply not have run yet.
            var shownFor = Clock.Elapsed.TotalSeconds - request.ShownAt;
            // Over the city map the player cannot be looking at our popup.
            if (shownFor < FastConfirmSeconds || global::CityMap.IsOpen)
            {
                End(request, "denied");
                return;
            }
            if (shownFor >= PopupSeconds)
            {
                End(request, "expired");
                return;
            }

            var token = NewToken();
            var now = NowSeconds();
            var list = new List<Entry>(_entries);
            var added = new Entry(Sha256(token), request.Origin, request.Name, now, now);
            list.Add(added);
            // At most ten. A browser approved and never used goes first (the oldest such),
            // then the one used longest ago; never the one approved just now.
            while (list.Count > MaxApproved)
            {
                var victim = -1;
                for (var i = 0; i < list.Count; i++)
                {
                    if (ReferenceEquals(list[i], added)) continue;
                    if (victim < 0 || Worse(list[i], list[victim])) victim = i;
                }
                list.RemoveAt(victim);
            }
            _entries = list.ToArray();
            Save();

            lock (_gate)
            {
                request.State = "approved";
                request.Token = token;
                if (_pending == request) _pending = null;
            }
            _strikes.Remove(request.Origin);
            LinkMod.LogInfo("approved a browser (" + (request.Origin.Length == 0 ? "no origin" : request.Origin) + ").");
        }

        /// <summary>Evicted before the other: never used after approval, then used longer ago.</summary>
        private static bool Worse(Entry a, Entry b)
        {
            var aUnused = a.LastUsed == a.Created;
            var bUnused = b.LastUsed == b.Created;
            if (aUnused != bUnused) return aUnused;
            return a.LastUsed < b.LastUsed;
        }

        /// <summary>Deny, Escape, the phone opening: the game gives them all the one cancel callback.</summary>
        private void OnCancel(Request request)
        {
            if (_cleared) return;
            End(request, "denied");
        }

        /// <summary>
        /// Main thread. A request ends unapproved ("denied" or "expired"), and its origin
        /// waits before it may ask again, longer on each repeat.
        /// </summary>
        private void End(Request request, string state)
        {
            lock (_gate)
            {
                if (request.State != "pending") return;
                request.State = state;
                if (_pending == request) _pending = null;
            }
            Strike(request.Origin);
        }

        private void Strike(string origin)
        {
            var now = Clock.Elapsed.TotalSeconds;
            Strikes strikes;
            if (!_strikes.TryGetValue(origin, out strikes) || now - strikes.At > StrikeMemoryMinutes * 60.0)
            {
                strikes = new Strikes();
                _strikes[origin] = strikes;
            }
            strikes.Count++;
            strikes.At = now;
        }

        /// <summary>Seconds this origin must still wait; 0 when it may ask.</summary>
        private double CooldownLeft(string origin, double now)
        {
            Strikes strikes;
            if (!_strikes.TryGetValue(origin, out strikes) || strikes.Count == 0) return 0;
            var step = Math.Min(strikes.Count, CooldownSeconds.Length) - 1;
            var left = CooldownSeconds[step] - (now - strikes.At);
            return left > 0 ? left : 0;
        }

        /// <summary>
        /// Main thread, once a second: a request unanswered for 60 s expires and its popup
        /// closes, if it is still ours on screen; old requests are forgotten.
        /// </summary>
        public void PumpOnMainThread()
        {
            if (_cleared) return;
            var now = Clock.Elapsed.TotalSeconds;
            Request expired = null;
            lock (_gate)
            {
                if (_pending != null && now - _pending.ShownAt >= PopupSeconds) expired = _pending;

                var old = new List<string>();
                foreach (var pair in _requests)
                    if (pair.Value.State != "pending" && now - pair.Value.ShownAt > RememberRequestMinutes * 60.0)
                        old.Add(pair.Key);
                foreach (var id in old) _requests.Remove(id);
            }
            // The city map opened over our popup: the player cannot see it, so it ends as a
            // dismissal and closes, like Escape would.
            Request hidden = null;
            if (expired == null && global::CityMap.IsOpen)
            {
                lock (_gate) hidden = _pending;
            }
            if (expired != null) End(expired, "expired");
            if (hidden != null)
            {
                End(hidden, "denied");
                expired = hidden;
            }

            // Its state is already set, so the cancel callback closing it fires changes
            // nothing.
            if (expired != null && OurPopupIsOpen(expired))
            {
                try
                {
                    var close = global::HudConfirm.onClose;
                    if (close != null) close();
                }
                catch (Exception e)
                {
                    LinkMod.LogWarn("could not close the expired approval popup: " + e.Message);
                }
            }
        }

        /// <summary>
        /// True when the popup on screen is this request's: the displayed HudConfirmUi (its
        /// container active, and the phone's copy exactly when the phone is open) holds
        /// its confirm action. Without the private fields (a later build) nothing proves it is
        /// ours, so it is left open: closing the player's own popup would be worse than
        /// leaving ours to them.
        /// </summary>
        private static bool OurPopupIsOpen(Request request)
        {
            if (!global::HudConfirm.isOpen || PopupConfirmAction == null || PopupContainer == null || PopupInFullMenu == null)
                return false;
            // Inactive ones too: which popup draws depends on whether the phone is open.
            foreach (var ui in UnityEngine.Resources.FindObjectsOfTypeAll<global::HudConfirmUi>())
            {
                if (!ReferenceEquals(PopupConfirmAction.GetValue(ui), request.OnConfirm)) continue;
                var container = PopupContainer.GetValue(ui) as UnityEngine.RectTransform;
                if (container == null || !container.gameObject.activeInHierarchy) continue;
                if ((bool)PopupInFullMenu.GetValue(ui) != global::UI.Smartphone.FullMenu.IsOpen) continue;
                return true;
            }
            return false;
        }

        // ---- GET /pair/status (HTTP thread) ------------------------------------------

        public WriteAnswer HandleStatus(HttpListenerRequest request)
        {
            var id = request.QueryString["id"];
            var w = new JsonWriter();
            lock (_gate)
            {
                Request r;
                if (string.IsNullOrEmpty(id) || !_requests.TryGetValue(id, out r)) return WriteAnswer.Error(404, "not_found");
                w.BeginObject();
                w.Prop("state", r.State);
                if (r.Token != null)
                {
                    // Exactly once: the next poll of this request answers without it.
                    w.Prop("token", r.Token);
                    r.Token = null;
                }
                w.EndObject();
            }
            return new WriteAnswer(200, w.ToString());
        }

        // ---- forgetting (main thread) ------------------------------------------------

        /// <summary>Main thread, from the options panel: every approval gone; answers how many there were.</summary>
        public int ForgetAll()
        {
            var count = _entries.Length;
            _entries = new Entry[0];
            Save();
            return count;
        }

        // ---- storage (main thread) ---------------------------------------------------

        private void Touch(Entry used, long now)
        {
            if (_cleared) return;
            var list = new List<Entry>(_entries);
            var i = list.IndexOf(used);
            if (i < 0) return; // forgotten or replaced meanwhile
            // One second on at least, so a first use in the second of approval still
            // differs from the creation time.
            list[i] = new Entry(used.Hash, used.Origin, used.Name, used.Created, Math.Max(now, used.Created + 1));
            _entries = list.ToArray();
            Save();
        }

        private static bool Idle(Entry entry, long now)
        {
            return now - entry.LastUsed > IdleDaysBeforeExpiry * 86400L;
        }

        /// <summary>
        /// UnityEngine.PlayerPrefs by its full name: the game has a PlayerPrefs class of its
        /// own. The SDK keeps mod options there too.
        /// </summary>
        private void Save()
        {
            var w = new JsonWriter();
            w.BeginArray();
            foreach (var e in _entries)
            {
                w.BeginObject();
                w.Prop("hash", Hex(e.Hash));
                w.Prop("origin", e.Origin);
                w.Prop("name", e.Name);
                w.Prop("created", (double)e.Created);
                w.Prop("lastUsed", (double)e.LastUsed);
                w.EndObject();
            }
            w.EndArray();
            try
            {
                UnityEngine.PlayerPrefs.SetString(PrefsKey, w.ToString());
                UnityEngine.PlayerPrefs.Save();
            }
            catch (Exception e)
            {
                LinkMod.LogError("could not store the approved browsers: " + e.Message);
            }
        }

        private static List<Entry> Load()
        {
            var list = new List<Entry>();
            string text;
            try
            {
                text = UnityEngine.PlayerPrefs.GetString(PrefsKey, "");
            }
            catch (Exception e)
            {
                LinkMod.LogError("could not read the approved browsers: " + e.Message);
                return list;
            }
            if (string.IsNullOrEmpty(text)) return list;

            try
            {
                foreach (var item in JsonReader.Arr(JsonReader.Parse(text), "approved"))
                {
                    var o = JsonReader.Obj(item, "approved[]");
                    var hash = FromHex(JsonReader.Str(o, "hash", "approved[]", true));
                    if (hash == null || hash.Length != 32) continue;
                    list.Add(new Entry(hash,
                        JsonReader.Str(o, "origin", "approved[]", false) ?? "",
                        JsonReader.Str(o, "name", "approved[]", false) ?? "",
                        (long)JsonReader.Num(o, "created", "approved[]"),
                        (long)JsonReader.Num(o, "lastUsed", "approved[]")));
                }
            }
            catch (Exception e)
            {
                // A value this mod did not write (or one cut short): start over rather than
                // fail every write, and never fail the city load.
                LinkMod.LogWarn("the stored approved browsers could not be read (" + e.Message + "); starting with none.");
                list.Clear();
            }
            return list;
        }

        // ---- small helpers -----------------------------------------------------------

        private static long NowSeconds()
        {
            return (long)(DateTime.UtcNow - UnixEpoch).TotalSeconds;
        }

        private static string NewToken()
        {
            var bytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static string NewId()
        {
            var bytes = new byte[12];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return Hex(bytes);
        }

        private static byte[] Sha256(string token)
        {
            using (var sha = SHA256.Create()) return sha.ComputeHash(Encoding.UTF8.GetBytes(token));
        }

        private static bool FixedTimeEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            var diff = 0;
            for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        private static string Hex(byte[] bytes)
        {
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        private static byte[] FromHex(string hex)
        {
            if (hex == null || hex.Length % 2 != 0) return null;
            var bytes = new byte[hex.Length / 2];
            for (var i = 0; i < bytes.Length; i++)
            {
                int value;
                if (!int.TryParse(hex.Substring(i * 2, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out value))
                    return null;
                bytes[i] = (byte)value;
            }
            return bytes;
        }
    }
}
