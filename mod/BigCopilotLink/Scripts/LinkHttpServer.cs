using System;
using System.Globalization;
using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace BigCopilotLink
{
    /// <summary>
    /// Loopback-only HTTP listener: one accept thread, bounded work handled on a pool
    /// thread, serving the contract in docs/game-link-api.md. Handlers touch nothing
    /// but the volatile fields of HealthState and the immutable Snapshot — never
    /// Unity, never the game. What has to reach the game, POST /refresh and the
    /// writes (WriteService), goes through MainThreadDispatcher and waits with a
    /// timeout.
    /// </summary>
    public sealed class LinkHttpServer
    {
        /// <summary>
        /// How long /refresh waits for the main thread before answering "accepted"
        /// anyway. Clients abort a call after five seconds; this stays well inside.
        /// </summary>
        private const int MainThreadWaitMs = 3000;

        private const string ExposeHeaders =
            "ETag, X-Game-Link-Stamp, X-Game-Link-Day, X-Game-Link-Character, Retry-After";

        /// <summary>
        /// The board itself, and any local page: the watcher and a build_web.py
        /// preview both speak from loopback. Nothing else, ever — the bytes are the
        /// player's whole company.
        /// </summary>
        private static readonly Regex LoopbackOrigin = new Regex(
            @"^http://(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        private static readonly string[] AllowedOrigins =
        {
            "https://bigcopilot.com",
            "https://www.bigcopilot.com"
        };

        private const string EndpointsJson =
            "[\"/health\",\"/save\",\"/refresh\",\"/pair/request\",\"/pair/status\",\"/write/uniforms\",\"/write/imports\",\"/write/schedule\",\"/write/hire\",\"/write/marketing\",\"/write/undo\"]";

        private readonly int _port;
        private readonly SaveService _saves;
        private readonly HealthState _health;
        private readonly WriteService _writes;
        private readonly ApprovalService _approvals;
        public const int WorkRequestCapacity = 8;
        public const int ReadRequestCapacity = 4;
        private const int ReadWorkers = 2;
        private ListenerSession _session;
        // Pending old-generation pool callbacks still count after stop/restart.
        private static int OutstandingWorkRequests;

        // Every listener generation owns its counters, socket and cancellation.
        // Old handlers cannot spend or release a restarted listener's permits.
        private sealed class ListenerSession
        {
            public HttpListener Listener;
            public Thread Acceptor;
            public readonly Thread[] Readers = new Thread[ReadWorkers];
            public readonly BlockingCollection<HttpListenerContext> ReadQueue = new BlockingCollection<HttpListenerContext>(ReadRequestCapacity);
            public readonly CancellationTokenSource Stop = new CancellationTokenSource();
            public volatile bool Running;
            public int WorkRequests;
            public int ReadRequests;
        }

        public LinkHttpServer(int port, SaveService saves, HealthState health, WriteService writes, ApprovalService approvals)
        {
            _approvals = approvals;
            _port = port;
            _saves = saves;
            _health = health;
            _writes = writes;
        }

        public int Port { get { return _port; } }

        public string Url
        {
            get { return "http://127.0.0.1:" + _port.ToString(CultureInfo.InvariantCulture) + "/"; }
        }

        /// <summary>Throws when the port is taken; the caller logs and stays idle.</summary>
        public void Start()
        {
            if (_session != null && _session.Running) return;
            var session = new ListenerSession { Listener = new HttpListener() };
            session.Listener.Prefixes.Add(Url);
            session.Listener.Start();
            session.Running = true;
            _session = session;
            try
            {
                // Dedicated readers keep health/save off the pool threads waiting
                // for writes, pairing or refresh work on the Unity main thread.
                for (var i = 0; i < ReadWorkers; i++)
                {
                    session.Readers[i] = new Thread(() => ReadLoop(session)) { Name = "BigCopilotLink.Read", IsBackground = true };
                    session.Readers[i].Start();
                }
                session.Acceptor = new Thread(() => Loop(session)) { Name = "BigCopilotLink.Http", IsBackground = true };
                session.Acceptor.Start();
            }
            catch { Stop(); throw; }
        }

        public void Stop()
        {
            var session = _session;
            _session = null;
            if (session == null) return;
            session.Running = false;
            session.Stop.Cancel();
            session.ReadQueue.CompleteAdding();
            try { session.Listener.Stop(); session.Listener.Close(); }
            catch (Exception) { }
            if (session.Acceptor != null && session.Acceptor.IsAlive) session.Acceptor.Join(1000);
            // Do not wait for handlers on the main thread: a running write must
            // finish with its real result, and pending work was cancelled above.
        }

        private static bool Admit(ref int count, int capacity)
        {
            while (true)
            {
                var current = Volatile.Read(ref count);
                if (current >= capacity) return false;
                if (Interlocked.CompareExchange(ref count, current + 1, current) == current) return true;
            }
        }

        private void Loop(ListenerSession session)
        {
            while (session.Running)
            {
                HttpListenerContext context;
                try { context = session.Listener.GetContext(); }
                catch (Exception) { break; }
                string method;
                try { method = context.Request.HttpMethod; }
                catch (Exception) { TryAbort(context); continue; }
                // Preflight never waits behind admitted work: the browser must be
                // able to read the eventual 503 and Retry-After on its POST.
                if (method == "OPTIONS")
                {
                    try { WritePreflight(context, ApplyCors(context.Request, context.Response)); }
                    catch (Exception) { TryAbort(context); }
                    continue;
                }
                var read = method == "GET" || method == "HEAD";
                if (read)
                {
                    if (!Admit(ref session.ReadRequests, ReadRequestCapacity)) { RejectBusy(context); continue; }
                    var queued = false;
                    try { queued = session.Running && session.ReadQueue.TryAdd(context); }
                    catch (InvalidOperationException) { }
                    finally
                    {
                        if (!queued) { Interlocked.Decrement(ref session.ReadRequests); TryAbort(context); }
                    }
                    continue;
                }
                if (!Admit(ref OutstandingWorkRequests, WorkRequestCapacity)) { RejectBusy(context); continue; }
                Interlocked.Increment(ref session.WorkRequests);
                var accepted = false;
                try
                {
                    accepted = ThreadPool.QueueUserWorkItem(_ => Process(context, session, false));
                }
                catch (Exception e)
                {
                    if (session.Running) LinkMod.LogWarn("could not queue a request: " + e.GetType().Name);
                }
                finally
                {
                    if (!accepted) { Interlocked.Decrement(ref session.WorkRequests); Interlocked.Decrement(ref OutstandingWorkRequests); TryAbort(context); }
                }
            }
        }

        private void ReadLoop(ListenerSession session)
        {
            foreach (var context in session.ReadQueue.GetConsumingEnumerable()) Process(context, session, true);
        }

        private void Process(HttpListenerContext context, ListenerSession session, bool read)
        {
            try
            {
                if (session.Running) Handle(context, session.Stop.Token);
                else TryAbort(context);
            }
            catch (Exception e)
            {
                if (session.Running) LinkMod.LogError("request failed: " + e);
                TryAbort(context);
            }
            finally
            {
                if (read) Interlocked.Decrement(ref session.ReadRequests);
                else { Interlocked.Decrement(ref session.WorkRequests); Interlocked.Decrement(ref OutstandingWorkRequests); }
            }
        }

        private static void RejectBusy(HttpListenerContext context)
        {
            try
            {
                var allowed = ApplyCors(context.Request, context.Response);
                var forbidden = !allowed && !string.IsNullOrEmpty(context.Request.Headers["Origin"]);
                context.Response.AddHeader("Retry-After", "1");
                if (context.Request.HttpMethod == "HEAD") WriteNoBody(context, forbidden ? 403 : 503);
                else WriteJson(context, forbidden ? 403 : 503, forbidden ? "{\"error\":\"origin_not_allowed\"}" : "{\"error\":\"busy\"}");
            }
            catch (Exception) { TryAbort(context); }
        }

        private void Handle(HttpListenerContext context, CancellationToken cancellation)
        {
            var request = context.Request;
            var url = request.Url;
            var path = url == null ? "" : url.AbsolutePath.TrimEnd('/');
            var method = request.HttpMethod;

            // Every response carries the CORS headers, refusals included, so the
            // browser can read the refusal instead of reporting a network error.
            var corsAllowed = ApplyCors(request, context.Response);

            if (method == "OPTIONS")
            {
                WritePreflight(context, corsAllowed);
                return;
            }

            // An Origin off the allowlist is turned away before any work (0.3.1). A
            // body-less POST is a CORS "simple" request, so without this any page could
            // make the game serialize, or be handed the bytes it cannot read. A request
            // with no Origin (curl, the CLI watcher) is served as before.
            if (!corsAllowed && !string.IsNullOrEmpty(request.Headers["Origin"]))
            {
                if (method == "HEAD") WriteNoBody(context, 403);
                else WriteJson(context, 403, "{\"error\":\"origin_not_allowed\"}");
                return;
            }

            if (method == "HEAD")
            {
                // A HEAD answer carries no body, or a kept-alive client reads the
                // leftover bytes as its next status line. 405 on the known paths.
                var known = path == "" || path == "/health" || path == "/save" || path == "/facts" || path == "/refresh" ||
                            path == "/pair/request" || path == "/pair/status" || WriteKind(path) != null;
                WriteNoBody(context, known ? 405 : 404);
                return;
            }

            switch (path)
            {
                case "":
                case "/health":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    _health.MarkHealthPolled();
                    WriteJson(context, 200, HealthJson(_approvals.IsApproved(request)));
                    return;

                case "/facts":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    var factsSnapshot = _saves.Current;
                    if (factsSnapshot.IsEmpty) { WriteJson(context, 503, "{\"error\":\"no_save_yet\"}"); return; }
                    if (request.QueryString["stamp"] != factsSnapshot.Stamp) { WriteJson(context, 409, "{\"error\":\"stamp_mismatch\"}"); return; }
                    WriteJson(context, 200, factsSnapshot.Facts);
                    return;

                case "/save":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleSave(context);
                    return;

                case "/refresh":
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleRefresh(context, cancellation);
                    return;

                case "/pair/request":
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    var paired = _approvals.HandleRequest(request, cancellation);
                    WriteJson(context, paired.Status, paired.Json);
                    return;

                case "/pair/status":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    var status = _approvals.HandleStatus(request);
                    WriteJson(context, status.Status, status.Json);
                    return;

                default:
                    var kind = WriteKind(path);
                    if (kind == null)
                    {
                        WriteJson(context, 404, "{\"error\":\"not_found\",\"endpoints\":" + EndpointsJson + "}");
                        return;
                    }
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    var answer = _writes.Handle(request, kind, cancellation);
                    WriteJson(context, answer.Status, answer.Json);
                    return;
            }
        }

        /// <summary>"uniforms", "imports", "schedule", "hire", "marketing" or "undo" for a write path, else null.</summary>
        private static string WriteKind(string path)
        {
            switch (path)
            {
                case "/write/uniforms": return "uniforms";
                case "/write/imports": return "imports";
                case "/write/schedule": return "schedule";
                case "/write/hire": return "hire";
                case "/write/marketing": return "marketing";
                case "/write/undo": return "undo";
                default: return null;
            }
        }

        // ---- CORS ----------------------------------------------------------------

        /// <summary>
        /// Returns true when the request came from an allowed origin. A request with
        /// no Origin (curl, the CLI watcher) is served as is and gets no headers; an
        /// origin off the list gets none either, which is what the browser blocks on.
        /// </summary>
        private static bool ApplyCors(HttpListenerRequest request, HttpListenerResponse response)
        {
            var origin = request.Headers["Origin"];
            if (string.IsNullOrEmpty(origin) || !IsAllowedOrigin(origin)) return false;

            // AddHeader rather than the Headers indexer: it is the method
            // HttpListenerResponse documents, and it replaces rather than appends.
            response.AddHeader("Access-Control-Allow-Origin", origin);
            response.AddHeader("Vary", "Origin");
            response.AddHeader("Access-Control-Expose-Headers", ExposeHeaders);
            return true;
        }

        internal static bool IsAllowedOrigin(string origin)
        {
            for (var i = 0; i < AllowedOrigins.Length; i++)
            {
                if (string.Equals(origin, AllowedOrigins[i], StringComparison.OrdinalIgnoreCase)) return true;
            }
            return LoopbackOrigin.IsMatch(origin);
        }

        private static void WritePreflight(HttpListenerContext context, bool corsAllowed)
        {
            var response = context.Response;
            if (corsAllowed)
            {
                response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                // Authorization carries the approval token; Content-Type: application/json
                // is what makes a write preflight at all.
                response.AddHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match");
                response.AddHeader("Access-Control-Max-Age", "600");

                // Chrome's private-network gate: answer it only when it was asked.
                var asked = context.Request.Headers["Access-Control-Request-Private-Network"];
                if (string.Equals(asked, "true", StringComparison.OrdinalIgnoreCase))
                    response.AddHeader("Access-Control-Allow-Private-Network", "true");
            }
            WriteNoBody(context, 204);
        }

        // ---- endpoints -----------------------------------------------------------

        private string HealthJson(bool paired)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("ok", true);
            w.Prop("schemaVersion", LinkMod.SchemaVersion);
            w.Prop("modVersion", LinkMod.Version);
            w.Prop("source", "game");
            w.Prop("build", _health.Build);
            w.Prop("character", _health.Character);
            w.Prop("company", _health.Company);
            w.Prop("day", _health.Day);
            w.Prop("hour", _health.Hour);
            w.PropFloat("minute", _health.Minute);
            w.PropFloat("cash", _health.Cash);

            var snap = _saves.Current;
            w.Prop("stamp", snap.Stamp);
            w.Prop("busy", _saves.Busy);
            w.Prop("size", snap.IsEmpty ? 0 : snap.Bytes.Length);

            if (snap.RefreshedAtUtcIso == null) w.PropNull("refreshedAt");
            else w.Prop("refreshedAt", snap.RefreshedAtUtcIso);

            // Additive in 0.2.0: which writes this mod takes, and whether this request
            // carried a token the player approved for its origin (a poll without one
            // always reads false).
            w.BeginArray("writes");
            foreach (var kind in WriteService.Kinds) w.Value(kind);
            w.EndArray();
            // Additive in 0.4.0: what a kind can do beyond its first contract.
            w.BeginArray("features");
            foreach (var feature in WriteService.Features) w.Value(feature);
            w.Value("building-facts.v1");
            w.EndArray();
            w.Prop("paired", paired);
            w.EndObject();
            return w.ToString();
        }

        private void HandleSave(HttpListenerContext context)
        {
            // One reference, taken once: the bytes, the stamp and the day on it
            // are the same refresh whatever the main thread publishes meanwhile.
            var snap = _saves.Current;
            var stamp = snap.Stamp;
            var bytes = snap.Bytes;
            var day = snap.Day;

            if (snap.IsEmpty || bytes == null || bytes.Length == 0)
            {
                WriteJson(context, 503, "{\"error\":\"no_save_yet\"}");
                return;
            }

            var etag = "\"" + stamp + "\"";
            var response = context.Response;
            response.AddHeader("ETag", etag);
            response.AddHeader("X-Game-Link-Stamp", stamp);
            response.AddHeader("X-Game-Link-Day", day.ToString(CultureInfo.InvariantCulture));
            response.AddHeader("X-Game-Link-Character", snap.Character);
            response.AddHeader("Cache-Control", "no-store");

            var ifNoneMatch = context.Request.Headers["If-None-Match"];
            if (ifNoneMatch != null && ifNoneMatch.Trim() == etag)
            {
                WriteNoBody(context, 304);
                return;
            }

            response.StatusCode = 200;
            response.ContentType = "application/octet-stream";
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
            response.OutputStream.Close();
        }

        private void HandleRefresh(HttpListenerContext context, CancellationToken cancellation)
        {
            var stampBefore = _saves.Current.Stamp;
            var saves = _saves;

            RefreshResult result;
            try
            {
                var task = MainThreadDispatcher.RunOnMainThread(() => saves.TryStartRefresh("request"), cancellation);
                if (task.Wait(MainThreadWaitMs))
                {
                    result = task.Result;
                }
                else
                {
                    // The main thread has not taken it yet: mid-load, or a long frame.
                    // The request stays queued and runs when the thread is free; the
                    // throttle folds it into a refresh still in flight or started
                    // within the request's window. Clients abort a call after five
                    // seconds, so the answer has to come now: accepted, and the
                    // stamp to watch /health for.
                    result = RefreshResult.Started();
                }
            }
            catch (Exception e)
            {
                if (e.GetBaseException() is DispatcherBusyException)
                { WriteJson(context, 503, "{\"error\":\"busy\"}"); return; }
                // A faulted task: no city/listener is available.
                LinkMod.LogError("refresh request failed on the main thread: " + e);
                WriteJson(context, 503, "{\"error\":\"main_thread_unavailable\"}");
                return;
            }

            if (result.Outcome == RefreshOutcome.Throttled)
            {
                var w = new JsonWriter();
                w.BeginObject();
                w.Prop("error", "throttled");
                w.Prop("retryAfter", result.RetryAfterSeconds);
                w.EndObject();
                WriteJson(context, 429, w.ToString());
                return;
            }

            if (result.Outcome == RefreshOutcome.CannotSave)
            {
                var w = new JsonWriter();
                w.BeginObject();
                w.Prop("error", "cannot_save");
                w.Prop("reason", result.Reason);
                w.EndObject();
                WriteJson(context, 409, w.ToString());
                return;
            }

            var accepted = new JsonWriter();
            accepted.BeginObject();
            accepted.Prop("accepted", true);
            accepted.Prop("stamp", stampBefore);
            accepted.EndObject();
            WriteJson(context, 202, accepted.ToString());
        }

        // ---- writing -------------------------------------------------------------

        private static void WriteJson(HttpListenerContext context, int status, string json)
        {
            var bytes = Encoding.UTF8.GetBytes(json);
            var response = context.Response;
            response.StatusCode = status;
            response.ContentType = "application/json";
            response.ContentEncoding = Encoding.UTF8;
            // Admission and dispatcher/write/approval refusals share the same hint.
            if (status == 503 && json == "{\"error\":\"busy\"}") response.AddHeader("Retry-After", "1");
            // A cached /health would hide a moved stamp from both clients.
            response.AddHeader("Cache-Control", "no-store");
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
            response.OutputStream.Close();
        }

        private static void WriteNoBody(HttpListenerContext context, int status)
        {
            var response = context.Response;
            response.StatusCode = status;
            response.ContentLength64 = 0;
            response.OutputStream.Close();
        }

        private static void TryAbort(HttpListenerContext context)
        {
            try
            {
                context.Response.Abort();
            }
            catch (Exception)
            {
                // Best effort.
            }
        }
    }
}
