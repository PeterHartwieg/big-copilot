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
    /// Loopback-only HTTP listener on a background thread, serving the contract in
    /// docs/game-link-api.md. Handlers touch nothing but the volatile fields of
    /// HealthState and SaveService — never Unity, never the game. The one thing that
    /// has to reach the game, POST /refresh, goes through MainThreadDispatcher and
    /// waits with a timeout.
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

        private readonly int _port;
        private readonly SaveService _saves;
        private readonly HealthState _health;
        private HttpListener _listener;
        private Thread _thread;
        private volatile bool _running;

        public LinkHttpServer(int port, SaveService saves, HealthState health)
        {
            _port = port;
            _saves = saves;
            _health = health;
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

                try
                {
                    Handle(context);
                }
                catch (Exception e)
                {
                    LinkMod.LogError("request failed: " + e);
                    TryAbort(context);
                }
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

            switch (path)
            {
                case "":
                case "/health":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    _health.MarkHealthPolled();
                    WriteJson(context, 200, HealthJson());
                    return;

                case "/save":
                    if (method != "GET") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleSave(context);
                    return;

                case "/refresh":
                    if (method != "POST") { WriteJson(context, 405, "{\"error\":\"method_not_allowed\"}"); return; }
                    HandleRefresh(context);
                    return;

                default:
                    WriteJson(context, 404,
                        "{\"error\":\"not_found\",\"endpoints\":[\"/health\",\"/save\",\"/refresh\"]}");
                    return;
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

        private static bool IsAllowedOrigin(string origin)
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
                response.AddHeader("Access-Control-Allow-Headers", "Content-Type, If-None-Match");
                response.AddHeader("Access-Control-Max-Age", "600");

                // Chrome's private-network gate: answer it only when it was asked.
                var asked = context.Request.Headers["Access-Control-Request-Private-Network"];
                if (string.Equals(asked, "true", StringComparison.OrdinalIgnoreCase))
                    response.AddHeader("Access-Control-Allow-Private-Network", "true");
            }
            WriteNoBody(context, 204);
        }

        // ---- endpoints -----------------------------------------------------------

        private string HealthJson()
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
