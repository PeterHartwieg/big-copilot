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

        private Action _intervalCallback;
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

            var go = new GameObject("BigCopilotLink.MainThreadDispatcher");
            go.hideFlags = HideFlags.HideAndDontSave;
            DontDestroyOnLoad(go);
            return go.AddComponent<MainThreadDispatcher>();
        }

        public void Uninstall()
        {
            _intervalCallback = null;
            Destroy(gameObject);
        }

        /// <summary>Run <paramref name="tick"/> on the main thread every N real-time seconds (first run on the next frame).</summary>
        public void StartInterval(float seconds, Action tick)
        {
            _intervalSeconds = seconds;
            _intervalCallback = tick;
            _accumulated = seconds;
        }

        public static void Enqueue(Action action)
        {
            Queue.Enqueue(action);
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
            Queue.Enqueue(() =>
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
