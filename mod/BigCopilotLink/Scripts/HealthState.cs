using System;
using System.Threading;

namespace BigCopilotLink
{
    /// <summary>
    /// The handful of live values /health reports. The main-thread pump writes them
    /// once a second; the HTTP thread only ever reads them, so the fields are
    /// <c>volatile</c> scalars and whole-string swaps — no lock on the HTTP path.
    /// The HTTP thread writes exactly one thing back, the time of the last /health
    /// poll, which is what "attached" means in docs/game-link-api.md.
    /// </summary>
    public sealed class HealthState
    {
        /// <summary>A client counts as attached for this long after a /health poll.</summary>
        public const int AttachedWindowSeconds = 120;

        private volatile int _day;
        private volatile int _hour;
        private volatile float _minute;
        private volatile float _cash;
        private volatile string _character = "";
        private volatile string _company = "";
        private volatile int _build;
        // GameVersion.buildNumber only. Stays 0 until the running game answers,
        // and is never filled from the save's buildNumberAtLastSave.
        private volatile int _runningBuild;

        // DateTime and long cannot be volatile, so the poll time crosses threads as
        // ticks through Interlocked.
        private long _lastHealthPollUtcTicks;

        public int Day { get { return _day; } }
        public int Hour { get { return _hour; } }
        public float Minute { get { return _minute; } }
        public float Cash { get { return _cash; } }
        public string Character { get { return _character; } }
        public string Company { get { return _company; } }
        public int Build { get { return _build; } }
        /// <summary>The running game's build, or 0 until GameVersion answers. Never the save stamp.</summary>
        public int RunningBuild { get { return _runningBuild; } }

        public DateTime LastHealthPollUtc
        {
            get { return new DateTime(Interlocked.Read(ref _lastHealthPollUtcTicks), DateTimeKind.Utc); }
        }

        /// <summary>Called by the HTTP thread on every /health.</summary>
        public void MarkHealthPolled()
        {
            Interlocked.Exchange(ref _lastHealthPollUtcTicks, DateTime.UtcNow.Ticks);
        }

        /// <summary>True while a client polled /health inside the window. Safe from any thread.</summary>
        public bool Attached
        {
            get
            {
                var ticks = Interlocked.Read(ref _lastHealthPollUtcTicks);
                if (ticks == 0L) return false;
                var age = DateTime.UtcNow - new DateTime(ticks, DateTimeKind.Utc);
                return age.TotalSeconds <= AttachedWindowSeconds;
            }
        }

        /// <summary>Main thread only — every game read in this class happens here.</summary>
        public void RefreshOnMainThread()
        {
            _day = TimeHelper.CurrentDay;
            _hour = TimeHelper.CurrentHour;
            _minute = TimeHelper.CurrentMinute;

            var stamped = 0;
            var instance = SaveGameManager.Current;
            if (instance != null)
            {
                _cash = instance.Money;
                _character = instance.characterId ?? "";
                _company = instance.SaveGameName ?? "";
                stamped = instance.buildNumberAtLastSave;
            }

            // Every pump, not once: an early save stamp must not stick after
            // GameVersion answers. RememberBuild keeps the two numbers apart.
            var next = RememberBuild(ReadRunningBuild(), stamped, _build, _runningBuild);
            _build = next[0];
            _runningBuild = next[1];
        }

        /// <summary>
        /// What /health should publish after one refresh. <paramref name="live"/> is
        /// GameVersion.buildNumber, or 0 when it has not answered.
        /// <paramref name="stamped"/> is the loaded save's buildNumberAtLastSave.
        /// <paramref name="held"/> and <paramref name="running"/> are the numbers
        /// already published. Returns {best known, running}. A positive live build
        /// replaces an earlier save-stamp fallback. The save stamp is never stored
        /// as the running build, and a later miss does not put it back over a
        /// build the game already reported.
        /// </summary>
        internal static int[] RememberBuild(int live, int stamped, int held, int running)
        {
            if (live > 0)
            {
                running = live;
                held = live;
            }
            else if (held == 0 && stamped > 0)
            {
                held = stamped;
            }
            return new[] { held, running };
        }

        /// <summary>
        /// GameVersion.buildNumber is a public field (verified on build 3680; the
        /// string getters are private). 0 until it answers. The save stamp is not
        /// a substitute here: <see cref="RememberBuild"/> may use it only as the
        /// best-known number, and only while this stays 0.
        /// </summary>
        private static int ReadRunningBuild()
        {
            try
            {
                var version = GameVersion.GetCurrent();
                if (version != null && version.buildNumber > 0) return version.buildNumber;
            }
            catch (Exception)
            {
                // A version we cannot read is not worth failing health over.
            }
            return 0;
        }

    }
}
