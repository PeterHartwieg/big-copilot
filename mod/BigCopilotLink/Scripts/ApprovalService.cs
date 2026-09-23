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
        private const int DeniedCooldownSeconds = 10;

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

        // HudConfirmUi keeps the confirm action of the popup it shows in a private field;
        // comparing it with ours tells our popup from another one.
        private static readonly FieldInfo PopupConfirmAction = typeof(global::HudConfirmUi)
            .GetField("_onConfirmAction", BindingFlags.Instance | BindingFlags.NonPublic);

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
            public DateTime ShownUtc;
            public Action OnConfirm;
        }

        private volatile Entry[] _entries = new Entry[0];

        private readonly object _gate = new object();
        // Under _gate. Written on the main thread, read by /pair/status.
        private readonly Dictionary<string, Request> _requests = new Dictionary<string, Request>(StringComparer.Ordinal);
        private Request _pending;
        // Main thread only.
        private readonly Dictionary<string, DateTime> _deniedAt = new Dictionary<string, DateTime>(StringComparer.Ordinal);
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
                if (now - entry.LastUsed > TouchEveryMinutes * 60L)
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

        /// <summary>Strips what TextMeshPro would read as markup and control characters; at most 40 characters.</summary>
        private static string CleanName(string name)
        {
            if (name == null) return "";
            var sb = new StringBuilder();
            foreach (var ch in name)
            {
                if (ch == '<' || ch == '>' || char.IsControl(ch)) continue;
                sb.Append(ch);
            }
            var clean = sb.ToString().Trim();
            return clean.Length > MaxNameLength ? clean.Substring(0, MaxNameLength).Trim() : clean;
        }

        private WriteAnswer StartOnMainThread(string origin, string name)
        {
            if (_cleared) return WriteAnswer.Error(503, "main_thread_unavailable");
            var now = DateTime.UtcNow;

            lock (_gate)
            {
                if (_pending != null)
                {
                    var left = PopupSeconds - (now - _pending.ShownUtc).TotalSeconds;
                    return Throttled(left);
                }
            }
            DateTime denied;
            if (_deniedAt.TryGetValue(origin, out denied) && (now - denied).TotalSeconds < DeniedCooldownSeconds)
                return Throttled(DeniedCooldownSeconds - (now - denied).TotalSeconds);

            // HudConfirm.Show confirms unseen when no popup UI is registered, and drops
            // the call without a callback when one is already open: refuse both first.
            if (global::HudConfirm.onShow == null) return CannotPair("no_ui");
            if (global::HudConfirm.isOpen) return CannotPair("popup_open");
            if (SaveGameManager.SavingGameInProgress) return CannotPair("saving");
            if (!SaveService.CanSaveNow()) return CannotPair(SaveService.RefusalReason());
            if (SaveGameManager.Current == null) return CannotPair("other");

            var request = new Request { Id = NewId(), Origin = origin, Name = name, ShownUtc = now };
            request.OnConfirm = delegate { OnConfirm(request); };

            try
            {
                var header = Localizor.LocalizorManager.Localize("bigcopilotlink_pair_title", null);
                var body = origin.Length == 0
                    ? Localizor.LocalizorManager.Localize("bigcopilotlink_pair_body_local", new { name = ShownName(name) })
                    : Localizor.LocalizorManager.Localize("bigcopilotlink_pair_body", new { origin = origin, name = ShownName(name) });
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

        private static string ShownName(string name)
        {
            return name.Length == 0 ? "?" : name;
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
            // decision, so it counts as a dismissal.
            if ((DateTime.UtcNow - request.ShownUtc).TotalSeconds < FastConfirmSeconds)
            {
                Deny(request);
                return;
            }

            var token = NewToken();
            var now = NowSeconds();
            var list = new List<Entry>(_entries);
            list.Add(new Entry(Sha256(token), request.Origin, request.Name, now, now));
            // At most ten: the one used longest ago goes.
            while (list.Count > MaxApproved)
            {
                var oldest = 0;
                for (var i = 1; i < list.Count; i++)
                    if (list[i].LastUsed < list[oldest].LastUsed) oldest = i;
                list.RemoveAt(oldest);
            }
            _entries = list.ToArray();
            Save();

            lock (_gate)
            {
                request.State = "approved";
                request.Token = token;
                if (_pending == request) _pending = null;
            }
            LinkMod.LogInfo("approved a browser (" + (request.Origin.Length == 0 ? "no origin" : request.Origin) + ").");
        }

        private void OnCancel(Request request)
        {
            if (_cleared) return;
            Deny(request);
        }

        /// <summary>Deny, Escape, the phone opening: the game gives them all the one cancel callback.</summary>
        private void Deny(Request request)
        {
            lock (_gate)
            {
                if (request.State != "pending") return;
                request.State = "denied";
                if (_pending == request) _pending = null;
            }
            _deniedAt[request.Origin] = DateTime.UtcNow;
        }

        /// <summary>
        /// Main thread, once a second: a request unanswered for 60 s expires and its popup
        /// closes, if it is still ours on screen; old requests are forgotten.
        /// </summary>
        public void PumpOnMainThread()
        {
            if (_cleared) return;
            var now = DateTime.UtcNow;
            Request expired = null;
            lock (_gate)
            {
                if (_pending != null && (now - _pending.ShownUtc).TotalSeconds >= PopupSeconds)
                {
                    expired = _pending;
                    expired.State = "expired";
                    _pending = null;
                }

                var old = new List<string>();
                foreach (var pair in _requests)
                    if (pair.Value.State != "pending" && (now - pair.Value.ShownUtc).TotalMinutes > RememberRequestMinutes)
                        old.Add(pair.Key);
                foreach (var id in old) _requests.Remove(id);
            }

            // Its state is already "expired", so the cancel callback closing it fires
            // changes nothing.
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
        /// True when the open confirm popup is this request's: a HudConfirmUi holding its
        /// confirm action. Without the private field (a later build), an open popup
        /// counts as ours, which it is unless ours vanished without an answer.
        /// </summary>
        private static bool OurPopupIsOpen(Request request)
        {
            if (!global::HudConfirm.isOpen) return false;
            if (PopupConfirmAction == null) return true;
            // Inactive ones too: which popup draws depends on whether the phone is open.
            foreach (var ui in UnityEngine.Resources.FindObjectsOfTypeAll<global::HudConfirmUi>())
                if (ReferenceEquals(PopupConfirmAction.GetValue(ui), request.OnConfirm)) return true;
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
            list[i] = new Entry(used.Hash, used.Origin, used.Name, used.Created, now);
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
            catch (BadRequestException e)
            {
                // A value this mod did not write: start over rather than fail every write.
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
