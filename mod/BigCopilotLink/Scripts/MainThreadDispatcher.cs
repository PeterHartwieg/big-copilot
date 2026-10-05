using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace BigCopilotLink
{
    /// <summary>Fixed internal producers; HTTP callers cannot consume these slots.</summary>
    public enum InternalWork { SaveCompletion, PostWriteRefresh, ListenerRestart }

    public sealed class DispatcherBusyException : InvalidOperationException
    {
        public DispatcherBusyException() : base("main thread queue is full") { }
    }

    /// <summary>The only crossing from HTTP/background threads into the current city.</summary>
    public sealed class MainThreadDispatcher : MonoBehaviour
    {
        public const int ExternalCapacity = 32;
        public const int MaxActionsPerFrame = 8;
        public const int FrameBudgetMilliseconds = 2;
        private static readonly object Gate = new object();
        private static readonly Queue<WorkItem> External = new Queue<WorkItem>();
        private static readonly Queue<InternalWork> InternalOrder = new Queue<InternalWork>();
        private static readonly Dictionary<InternalWork, WorkItem> Internal = new Dictionary<InternalWork, WorkItem>();
        private static bool Installed;
        private static int Generation;
        private bool _preferInternal = true;
        private Action _intervalCallback;
        private Action _frameCallback;
        private float _intervalSeconds;
        private float _accumulated;

        public static int Session { get { lock (Gate) return Generation; } }

        private sealed class WorkItem
        {
            public Action Action;
            public Action OnCancel;
            private int _state; // pending, running, cancelled; running work keeps its true result
            private CancellationTokenRegistration _registration;
            public void Bind(CancellationToken token) { _registration = token.Register(Cancel); }
            public void Cancel()
            {
                if (Interlocked.CompareExchange(ref _state, 2, 0) == 0 && OnCancel != null) OnCancel();
            }
            public void Run()
            {
                var run = Interlocked.CompareExchange(ref _state, 1, 0) == 0;
                _registration.Dispose();
                if (run) Action();
            }
            public void Drop() { Cancel(); _registration.Dispose(); }
        }

        private static void DropAll()
        {
            while (External.Count > 0) External.Dequeue().Drop();
            foreach (var item in Internal.Values) item.Drop();
            Internal.Clear();
            InternalOrder.Clear();
        }

        public static MainThreadDispatcher Install()
        {
            lock (Gate)
            {
                Installed = false;
                DropAll();
                Generation++;
                Installed = true;
            }
            var go = new GameObject("BigCopilotLink.MainThreadDispatcher");
            go.hideFlags = HideFlags.HideAndDontSave;
            DontDestroyOnLoad(go);
            return go.AddComponent<MainThreadDispatcher>();
        }

        public void Uninstall()
        {
            _intervalCallback = null;
            _frameCallback = null;
            lock (Gate) { Installed = false; DropAll(); }
            Destroy(gameObject);
        }

        public void StartInterval(float seconds, Action tick)
        {
            _intervalSeconds = seconds;
            _intervalCallback = tick;
            _accumulated = seconds;
        }
        public void StartEachFrame(Action tick) { _frameCallback = tick; }

        /// <summary>Best-effort external work: false when unloaded or the bounded queue is full.</summary>
        public static bool Enqueue(Action action)
        {
            lock (Gate)
            {
                if (!Installed || External.Count >= ExternalCapacity) return false;
                External.Enqueue(new WorkItem { Action = action });
                return true;
            }
        }

        /// <summary>One coalesced slot per internal producer; refuse only a stale/unloaded city.</summary>
        public static bool EnqueueInternal(InternalWork key, Action action, int session)
        {
            if (!Enum.IsDefined(typeof(InternalWork), key)) throw new ArgumentOutOfRangeException("key");
            lock (Gate)
            {
                if (!Installed || session != Generation) return false;
                WorkItem previous;
                if (Internal.TryGetValue(key, out previous)) previous.Drop();
                else InternalOrder.Enqueue(key);
                Internal[key] = new WorkItem { Action = action };
                return true;
            }
        }

        /// <summary>Pending requests are faulted on unload/stop; running functions finish normally.</summary>
        public static Task<T> RunOnMainThread<T>(Func<T> func, CancellationToken cancellation = default(CancellationToken))
        {
            var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            var item = new WorkItem
            {
                Action = () => { try { tcs.TrySetResult(func()); } catch (Exception e) { tcs.TrySetException(e); } },
                OnCancel = () => tcs.TrySetException(new OperationCanceledException("city or listener stopped"))
            };
            lock (Gate)
            {
                if (!Installed) tcs.TrySetException(new InvalidOperationException("no city is loaded"));
                else if (External.Count >= ExternalCapacity) tcs.TrySetException(new DispatcherBusyException());
                else { item.Bind(cancellation); External.Enqueue(item); }
            }
            return tcs.Task;
        }

        private WorkItem Take()
        {
            lock (Gate)
            {
                if (!Installed) return null;
                if (InternalOrder.Count > 0 && (_preferInternal || External.Count == 0))
                {
                    var key = InternalOrder.Dequeue();
                    var item = Internal[key];
                    Internal.Remove(key);
                    _preferInternal = false;
                    return item;
                }
                if (External.Count == 0) return null;
                _preferInternal = true;
                return External.Dequeue();
            }
        }

        private void Update()
        {
            var clock = Stopwatch.StartNew();
            for (var n = 0; n < MaxActionsPerFrame; n++)
            {
                if (n > 0 && clock.ElapsedMilliseconds >= FrameBudgetMilliseconds) break;
                var item = Take();
                if (item == null) break;
                try { item.Run(); }
                catch (Exception e) { UnityEngine.Debug.LogError("[BigCopilotLink] queued action failed: " + e); }
            }
            // A game operation cannot be interrupted mid-write; the budget is checked
            // between actions. The callbacks still run even when the queue stays full.
            if (_frameCallback != null)
            {
                try { _frameCallback(); }
                catch (Exception e) { UnityEngine.Debug.LogError("[BigCopilotLink] frame tick failed: " + e); }
            }
            if (_intervalCallback == null) return;
            _accumulated += Time.unscaledDeltaTime;
            if (_accumulated < _intervalSeconds) return;
            _accumulated = 0f;
            try { _intervalCallback(); }
            catch (Exception e) { UnityEngine.Debug.LogError("[BigCopilotLink] interval tick failed: " + e); }
        }
    }
}
