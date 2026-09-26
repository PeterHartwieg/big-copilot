using System;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace BigCopilotLink
{
    /// <summary>
    /// Loopback-only HTTP listener: one accept thread, each request handled on a pool
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
            "ETag, X-Game-Link-Stamp, X-Game-Link-Day, X-Game-Link-Character";

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
            "[\"/health\",\"/save\",\"/refresh\",\"/pair/request\",\"/pair/status\",\"/write/uniforms\",\"/write/imports\",\"/write/schedule\",\"/write/hire\",\"/write/undo\"]";

        private readonly int _port;
        private readonly SaveService _saves;
        private readonly HealthState _health;
        private readonly WriteService _writes;
        private readonly ApprovalService _approvals;
        private HttpListener _listener;
        private Thread _thread;
        private volatile bool _running;

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
            _listener = new HttpListener();
            _listener.Prefixes.Add(Url); // loopback only, by design
            _listener.Start();
            _running = true;
            _thread = new Thread(Loop) { Name = "BigCopilotLink.Http", IsBackground = true };
            _thread.Start();
        }

        public void Stop()
        {
            _running = false;
            try
            {
                if (_listener != null)
                {
                    _listener.Stop();
                    _listener.Close();
                }
            }
            catch (Exception)
            {
                // Already shutting down; nothing useful to do.
            }
            if (_thread != null) _thread.Join(1000);
            // Handlers in flight are not waited for: Stop() runs on the main thread,
            // which a /refresh handler may itself be waiting on, and there is nothing
            // to protect. The closed listener ends their requests, a /save holds its
            // own reference to an immutable Snapshot, and a late enqueue is refused.
            _listener = null;
            _thread = null;
        }

        private void Loop()
        {
            while (_running)
            {
                HttpListenerContext context;
                try
                {
                    context = _listener.GetContext();
                }
                catch (Exception)
                {
                    break; // listener stopped or disposed — normal shutdown path
                }

                // Each request on its own pool thread: a /refresh waits up to
                // three seconds for the main thread, and a second caller must
                // not queue behind it past its own five-second timeout. Handlers
                // touch only volatile fields, the immutable Snapshot and the
                // dispatcher, so they may run side by side. Only loopback can
                // reach this port, and the compress has its own thread, so a
                // flood of callers costs pool threads and nothing else.
                var queued = ThreadPool.QueueUserWorkItem(delegate
                {
                    try
                    {
                        Handle(context);
                    }
                    catch (Exception e)
                    {
                        // A listener closed under a handler (city unload, a port
                        // change) is the normal end of that request, not an error.
                        if (_running) LinkMod.LogError("request failed: " + e);
                        TryAbort(context);
                    }
                });
                if (!queued) TryAbort(context);
            }
        }

        private void Handle(HttpListenerContext context)
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
                var known = path == "" || path == "/health" || path == "/save" || path == "/refresh" ||
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

                case "/save":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleSave(context);
                    return;

                case "/refresh":
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleRefresh(context);
                    return;

                case "/pair/request":
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    var paired = _approvals.HandleRequest(request);
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
                    var answer = _writes.Handle(request, kind);
                    WriteJson(context, answer.Status, answer.Json);
                    return;
            }
        }

        /// <summary>"uniforms", "imports", "schedule", "hire" or "undo" for a write path, else null.</summary>
        private static string WriteKind(string path)
        {
            switch (path)
            {
                case "/write/uniforms": return "uniforms";
                case "/write/imports": return "imports";
                case "/write/schedule": return "schedule";
                case "/write/hire": return "hire";
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
            response.AddHeader("X-Game-Link-Character", _health.Character);
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

        private void HandleRefresh(HttpListenerContext context)
        {
            var stampBefore = _saves.Current.Stamp;
            var saves = _saves;

            RefreshResult result;
            try
            {
                var task = MainThreadDispatcher.RunOnMainThread(() => saves.TryStartRefresh("request"));
                if (task.Wait(MainThreadWaitMs))
                {
                    result = task.Result;
                }
                else
                {
                    // The main thread has not taken it yet: mid-load, or a long frame.
                    // The request stays queued and runs when the thread is free; the
                    // throttle folds it into any refresh that ran meanwhile. Clients
                    // abort a call after five seconds, so the answer has to come now:
                    // accepted, and the stamp to watch /health for.
                    result = RefreshResult.Started();
                }
            }
            catch (Exception e)
            {
                // A faulted task: no city is loaded (the dispatcher refused the work).
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
