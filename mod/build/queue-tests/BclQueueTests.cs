// Run only inside the installed game's SDK Unity project. Synthetic work and
// snapshot bytes only; no player save, gameplay writes or approval persistence.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.Serialization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using BigCopilotLink;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BclQueueTests
{
    private static readonly MethodInfo Update = typeof(MainThreadDispatcher).GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic);
    private static MainThreadDispatcher dispatcher;
    private static int checks;
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
        checks++;
    }
    private static void Pump() { Update.Invoke(dispatcher, null); }
    private static void Drain()
    {
        for (var i = 0; i < 100; i++) Pump();
    }
    private static void Wait(Func<bool> condition, string label)
    {
        Check(SpinWait.SpinUntil(condition, 5000), label);
    }
    private static object Field(object owner, string name)
    {
        return owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public).GetValue(owner);
    }
    private static void Set(object owner, string name, object value)
    {
        owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public).SetValue(owner, value);
    }
    private const string Requested = "BclQueueTests.Requested";
    private const string Result = "BclQueueTests.Result";
    private const string PreviousScenes = "BclQueueTests.PreviousScenes";
    [Serializable] private sealed class SceneInfo { public string path; public bool loaded; public bool active; }
    [Serializable] private sealed class SceneSet { public SceneInfo[] scenes; }

    [InitializeOnLoadMethod]
    private static void Resume()
    {
        if (SessionState.GetBool(Requested, false)) EditorApplication.playModeStateChanged += OnMode;
        else if (SessionState.GetString(PreviousScenes, "").Length > 0)
            EditorApplication.delayCall += Finish; // also recover a prior scene-restoration exception
    }
    public static void Run()
    {
        Check(!EditorApplication.isPlaying, "start synthetic validation outside play mode");
        var previous = EditorSceneManager.GetSceneManagerSetup();
        var infos = new SceneInfo[previous.Length];
        for (var i = 0; i < previous.Length; i++) infos[i] = new SceneInfo { path = previous[i].path, loaded = previous[i].isLoaded, active = previous[i].isActive };
        SessionState.SetString(PreviousScenes, JsonUtility.ToJson(new SceneSet { scenes = infos }));
        SessionState.SetBool(Requested, true);
        SessionState.SetInt(Result, 1);
        EditorApplication.playModeStateChanged += OnMode;
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        EditorApplication.isPlaying = true;
    }
    private static void OnMode(PlayModeStateChange mode)
    {
        if (mode == PlayModeStateChange.EnteredPlayMode)
        {
            try
            {
                // Empty SDK scene; never invoke serialize, gameplay writes or
                // pairing/persistence. All queue payloads and HTTP bytes are synthetic.
                dispatcher = MainThreadDispatcher.Install();
                DispatcherLimits();
                CancellationAndLifecycle();
                WriteWithdrawal();
                HttpBurst();
                UnityEngine.Debug.Log("[BclQueueTests] PASS " + checks + " checks; synthetic snapshots/actions only");
                SessionState.SetInt(Result, 0);
            }
            catch (Exception e) { UnityEngine.Debug.LogError("[BclQueueTests] FAIL " + e); }
            finally
            {
                if (dispatcher != null) dispatcher.Uninstall();
                EditorApplication.isPlaying = false;
            }
        }
        else if (mode == PlayModeStateChange.EnteredEditMode)
        {
            SessionState.SetBool(Requested, false);
            EditorApplication.playModeStateChanged -= OnMode;
            Finish();
        }
    }
    private static void Finish()
    {
        var code = SessionState.GetInt(Result, 1);
        try
        {
            var scenes = JsonUtility.FromJson<SceneSet>(SessionState.GetString(PreviousScenes, "{}"));
            var setup = new List<SceneSetup>();
            if (scenes != null && scenes.scenes != null)
                foreach (var scene in scenes.scenes)
                    if (!string.IsNullOrEmpty(scene.path)) setup.Add(new SceneSetup { path = scene.path, isLoaded = scene.loaded, isActive = scene.active });
            if (setup.Count > 0) EditorSceneManager.RestoreSceneManagerSetup(setup.ToArray());
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
        catch (Exception e) { UnityEngine.Debug.LogError("[BclQueueTests] scene restoration failed: " + e); code = 1; }
        finally { SessionState.SetString(PreviousScenes, ""); EditorApplication.Exit(code); }
    }

    private static void DispatcherLimits()
    {
        var ran = 0; var frames = 0; var intervals = 0; var completed = 0;
        dispatcher.StartEachFrame(() => frames++);
        dispatcher.StartInterval(0, () => intervals++);
        for (var i = 0; i < MainThreadDispatcher.ExternalCapacity; i++)
            Check(MainThreadDispatcher.Enqueue(() => ran++), "external slot admitted");
        Check(!MainThreadDispatcher.Enqueue(() => ran++), "external overflow refused");
        var full = MainThreadDispatcher.RunOnMainThread(() => 1);
        Check(full.IsFaulted && full.Exception.GetBaseException() is DispatcherBusyException, "task overflow faults immediately");
        for (var i = 0; i < 100; i++)
            Check(MainThreadDispatcher.EnqueueInternal(InternalWork.SaveCompletion, () => completed++, MainThreadDispatcher.Session), "internal completion admitted despite HTTP saturation");
        Pump();
        Check(completed == 1, "one coalesced completion runs");
        Check(ran <= MainThreadDispatcher.MaxActionsPerFrame - 1, "frame action count bounded");
        Check(frames == 1 && intervals == 1, "callbacks not starved by a full queue");
        Drain();
        Check(ran == MainThreadDispatcher.ExternalCapacity, "accepted external actions eventually run");
        ran = 0;
        MainThreadDispatcher.Enqueue(() => { Thread.Sleep(MainThreadDispatcher.FrameBudgetMilliseconds + 5); ran++; });
        MainThreadDispatcher.Enqueue(() => ran++);
        var before = frames;
        Pump();
        Check(ran == 1 && frames == before + 1, "elapsed budget stops between actions but still pumps callbacks");
        Pump();
        Check(ran == 2, "remaining work runs on a subsequent frame");
    }

    private static void CancellationAndLifecycle()
    {
        var ran = 0;
        var stop = new CancellationTokenSource();
        var pending = MainThreadDispatcher.RunOnMainThread(() => { ran++; return 9; }, stop.Token);
        stop.Cancel();
        Check(pending.IsFaulted, "stopped listener settles a pending task");
        Pump();
        Check(ran == 0, "cancelled work never runs later");
        var runningStop = new CancellationTokenSource();
        var running = MainThreadDispatcher.RunOnMainThread(() => { runningStop.Cancel(); return 17; }, runningStop.Token);
        Pump();
        Check(running.IsCompleted && !running.IsFaulted && running.Result == 17, "running work keeps its real result despite cancellation");
        var oldSession = MainThreadDispatcher.Session;
        var stale = MainThreadDispatcher.RunOnMainThread(() => { ran++; return 1; });
        dispatcher.Uninstall();
        Check(stale.IsFaulted, "unload settles queued task without waiting for HTTP timeout");
        Check(!MainThreadDispatcher.Enqueue(() => ran++), "unloaded external queue refuses work");
        dispatcher = MainThreadDispatcher.Install();
        Check(!MainThreadDispatcher.EnqueueInternal(InternalWork.SaveCompletion, () => ran++, oldSession), "late completion from the previous city refused");
        Pump();
        Check(ran == 0, "old city work never reaches the new city");
        stop.Dispose(); runningStop.Dispose();
    }

    private static void WriteWithdrawal()
    {
        // Exercise the production CAS JobBox without a city. The synthetic write
        // delegate must never reach gameplay; Gate returns cannot_write instead.
        var saves = new SaveService();
        var approvals = (ApprovalService)FormatterServices.GetUninitializedObject(typeof(ApprovalService));
        var owner = new WriteService(saves, approvals);
        var boxType = typeof(WriteService).GetNestedType("JobBox", BindingFlags.NonPublic);
        var ctor = boxType.GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)[0];
        var calls = 0;
        Func<WriteService, bool, WriteAnswer> action = (_owner, _dry) => { calls++; return new WriteAnswer(200, "{}"); };
        var box = ctor.Invoke(new object[] { owner, action, false });
        var withdraw = boxType.GetMethod("TryWithdraw");
        var run = boxType.GetMethod("Run");
        Check((bool)withdraw.Invoke(box, null), "unstarted write withdraws");
        Check(run.Invoke(box, null) == null && calls == 0, "withdrawn write cannot execute");
        var started = ctor.Invoke(new object[] { owner, action, false });
        var answer = (WriteAnswer?)run.Invoke(started, null);
        Check(answer.HasValue && answer.Value.Status == 409 && calls == 0, "no-city write returns actual refusal without gameplay action");
        Check(!(bool)withdraw.Invoke(started, null), "started write cannot be falsely withdrawn");
    }

    private sealed class Reply
    {
        public int Status; public string Body; public string Cors; public string Retry; public long Length;
    }
    private static Reply Request(string url, string method = "GET", string origin = "https://bigcopilot.com")
    {
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = method;
        request.Proxy = null;
        request.KeepAlive = false;
        request.Timeout = 5000; // application contract assertions, not a CLI execution deadline
        if (origin != null) request.Headers["Origin"] = origin;
        if (method == "POST") request.ContentLength = 0;
        HttpWebResponse response;
        try { response = (HttpWebResponse)request.GetResponse(); }
        catch (WebException e) { response = (HttpWebResponse)e.Response; if (response == null) throw; }
        using (response)
        using (var reader = new StreamReader(response.GetResponseStream()))
        {
            return new Reply { Status = (int)response.StatusCode, Body = reader.ReadToEnd(),
                Cors = response.Headers["Access-Control-Allow-Origin"], Retry = response.Headers["Retry-After"], Length = response.ContentLength };
        }
    }

    private static void HttpBurst()
    {
        var saves = new SaveService();
        Set(saves, "_current", new Snapshot(Encoding.UTF8.GetBytes("synthetic snapshot"), "synthetic-stamp", 1, "synthetic-time", "{}", "synthetic-character"));
        var approvals = (ApprovalService)FormatterServices.GetUninitializedObject(typeof(ApprovalService));
        var writes = new WriteService(saves, approvals);
        var server = new LinkHttpServer(18322, saves, new HealthState(), writes, approvals);
        var requests = new List<Task<Reply>>();
        ServicePointManager.DefaultConnectionLimit = 64;
        try
        {
            server.Start();
            var old = Field(server, "_session");
            for (var i = 0; i < LinkHttpServer.WorkRequestCapacity; i++)
            {
                var reply = new TaskCompletionSource<Reply>();
                requests.Add(reply.Task);
                new Thread(() => { try { reply.SetResult(Request(server.Url + "refresh", "POST")); } catch (Exception e) { reply.SetException(e); } }) { IsBackground = true }.Start();
            }
            Wait(() => (int)Field(old, "WorkRequests") == LinkHttpServer.WorkRequestCapacity, "work admissions reach bounded capacity");
            var busy = Request(server.Url + "refresh", "POST");
            Check(busy.Status == 503 && busy.Body.Contains("busy") && busy.Cors == "https://bigcopilot.com" && busy.Retry == "1", "overload is clear and CORS-readable");
            var denied = Request(server.Url + "refresh", "POST", "https://unapproved.example");
            Check(denied.Status == 403 && denied.Cors == null, "overload still enforces origin allowlist");
            var clock = Stopwatch.StartNew();
            var health = Request(server.Url + "health");
            var save = Request(server.Url + "save");
            Check(health.Status == 200 && save.Status == 200 && save.Body == "synthetic snapshot", "reserved readers serve health/save during blocked work burst");
            Check(clock.ElapsedMilliseconds < 1000, "health/save do not wait for work's three-second budget");
            Wait(() => (int)Field(old, "ReadRequests") == 0, "read permits released");
            Set(old, "ReadRequests", LinkHttpServer.ReadRequestCapacity);
            try
            {
                var preflight = Request(server.Url + "refresh", "OPTIONS");
                Check(preflight.Status == 204 && preflight.Cors == "https://bigcopilot.com", "preflight remains readable when both admission pools are full");
                var deniedPreflight = Request(server.Url + "refresh", "OPTIONS", "https://unapproved.example");
                Check(deniedPreflight.Status == 204 && deniedPreflight.Cors == null, "preflight under overload preserves origin denial");
                var head = Request(server.Url + "health", "HEAD");
                Check(head.Status == 503 && head.Length == 0 && head.Body.Length == 0 && head.Cors != null, "overloaded HEAD has no body");
            }
            finally { Set(old, "ReadRequests", 0); }
            server.Stop();
            Wait(() => (int)Field(old, "WorkRequests") == 0, "stop releases entire outstanding request generation");
            server.Start();
            var fresh = Field(server, "_session");
            Check(!ReferenceEquals(old, fresh), "restart owns fresh counters and cancellation");
            Drain();
            Check(Request(server.Url + "health").Status == 200 && Request(server.Url + "save").Status == 200, "restart keeps synthetic reads responsive");
            Check((int)Field(fresh, "WorkRequests") == 0, "old handlers do not decrement restarted generation");
            var outstanding = typeof(LinkHttpServer).GetField("OutstandingWorkRequests", BindingFlags.Static | BindingFlags.NonPublic);
            Check((int)outstanding.GetValue(null) == 0, "old generation releases global work capacity");
            outstanding.SetValue(null, LinkHttpServer.WorkRequestCapacity);
            try
            {
                Check(Request(server.Url + "refresh", "POST").Status == 503, "restarted listener cannot bypass outstanding old-generation work capacity");
                Check(Request(server.Url + "health").Status == 200, "old-generation saturation leaves reserved readers responsive");
            }
            finally { outstanding.SetValue(null, 0); }
            for (var i = 0; i < MainThreadDispatcher.ExternalCapacity; i++)
                Check(MainThreadDispatcher.Enqueue(() => { }), "fill actual dispatcher before HTTP refusal");
            try
            {
                foreach (var endpoint in new[] { "refresh", "pair/request" })
                {
                    var refused = Request(server.Url + endpoint, "POST");
                    Check(refused.Status == 503 && refused.Body == "{\"error\":\"busy\"}" && refused.Retry == "1"
                        && refused.Cors == "https://bigcopilot.com", "dispatcher-full " + endpoint + " has readable retry hint");
                    Wait(() => (int)Field(fresh, "WorkRequests") == 0, "dispatcher refusal releases HTTP admission");
                }
            }
            finally { Drain(); }
            var malformed = Request(server.Url + "write/unknown", "POST");
            Check(malformed.Status == 404, "handler refusal still finishes request");
            Wait(() => (int)Field(fresh, "WorkRequests") == 0, "refused handler releases admission");
        }
        finally { server.Stop(); }
        foreach (var task in requests) { try { task.Wait(); } catch (AggregateException) { } }
    }
}
