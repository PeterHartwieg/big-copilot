using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using UnityEngine;

namespace BigCopilotLink
{
    /// <summary>
    /// Hidden GameObject that pumps queued work and a fixed-interval callback on the
    /// Unity main thread. This is the only sanctioned crossing from the HTTP thread
    /// into game state — see docs/game-link-api.md.
    /// </summary>
    public sealed class MainThreadDispatcher : MonoBehaviour
    {
        private static readonly ConcurrentQueue<Action> Queue = new ConcurrentQueue<Action>();

        // Enqueue after Uninstall would park the closure, and whatever it holds,
        // in this static field until the next city load; refuse it instead. The
        // gate makes the check and the push one step against Uninstall's drain.
        private static readonly object Gate = new object();
        private static bool Installed;

        private Action _intervalCallback;
        private Action _frameCallback;
        private float _intervalSeconds;
        private float _accumulated;

        public static MainThreadDispatcher Install()
        {
            // The queue is static so the HTTP thread can reach it without an instance.
            // Drop anything a previous city load left behind before pumping again.
            Action stale;
            while (Queue.TryDequeue(out stale))
            {
            }

            lock (Gate) Installed = true;
            var go = new GameObject("BigCopilotLink.MainThreadDispatcher");
            go.hideFlags = HideFlags.HideAndDontSave;
            DontDestroyOnLoad(go);
            return go.AddComponent<MainThreadDispatcher>();
        }

        public void Uninstall()
        {
            _intervalCallback = null;
            _frameCallback = null;
            // Nothing queued may run without a city, and a queued publish would
            // hold the player's bytes in a static field until the next load.
            lock (Gate)
            {
                Installed = false;
                Action stale;
                while (Queue.TryDequeue(out stale))
                {
                }
            }
            Destroy(gameObject);
        }

        /// <summary>Run <paramref name="tick"/> on the main thread every N real-time seconds (first run on the next frame).</summary>
        public void StartInterval(float seconds, Action tick)
        {
            _intervalSeconds = seconds;
            _intervalCallback = tick;
            _accumulated = seconds;
        }

        /// <summary>Queues work for the next frame. False, and nothing queued, when no city is loaded.</summary>
        /// <summary>Run <paramref name="tick"/> on the main thread every frame: for edges a one-second pump would miss.</summary>
        public void StartEachFrame(Action tick)
        {
            _frameCallback = tick;
        }

        public static bool Enqueue(Action action)
        {
            lock (Gate)
            {
                if (!Installed) return false;
                Queue.Enqueue(action);
                return true;
            }
        }

        /// <summary>
        /// Run a function on the main thread from the HTTP thread and await its result.
        /// Preconditions must be validated inside <paramref name="func"/> — game state
        /// may have changed since the request arrived. The caller must time out: if the
        /// main thread is wedged, nothing ever dequeues this.
        /// </summary>
        public static Task<T> RunOnMainThread<T>(Func<T> func)
        {
            var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            var queued = Enqueue(() =>
            {
                try
                {
                    tcs.SetResult(func());
                }
                catch (Exception e)
                {
                    tcs.SetException(e);
                }
            });
            // No city: the caller gets a faulted task at once, not one that never
            // completes (and never a refresh run against a later city).
            if (!queued) tcs.SetException(new InvalidOperationException("no city is loaded"));
            return tcs.Task;
        }

        private void Update()
        {
            Action action;
            while (Queue.TryDequeue(out action))
            {
                try
                {
                    action();
                }
                catch (Exception e)
                {
                    Debug.LogError("[BigCopilotLink] queued action failed: " + e);
                }
            }

            if (_frameCallback != null)
            {
                try
                {
                    _frameCallback();
                }
                catch (Exception e)
                {
                    Debug.LogError("[BigCopilotLink] frame tick failed: " + e);
                }
            }

            if (_intervalCallback == null) return;

            _accumulated += Time.unscaledDeltaTime;
            if (_accumulated < _intervalSeconds) return;
            _accumulated = 0f;

            try
            {
                _intervalCallback();
            }
            catch (Exception e)
            {
                Debug.LogError("[BigCopilotLink] interval tick failed: " + e);
            }
        }
    }
}
