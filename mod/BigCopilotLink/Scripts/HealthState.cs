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

            var instance = SaveGameManager.Current;
            if (instance != null)
            {
                _cash = instance.Money;
                _character = instance.characterId ?? "";
                _company = instance.SaveGameName ?? "";
            }

            // The build number only has to be found once. Before the first save the
            // fallback reads 0, so keep trying until something answers.
            if (_build == 0) _build = ReadBuildNumber();
        }

        /// <summary>
        /// GameVersion.buildNumber is a public field (verified on build 3680; the
        /// string getters are private). The fallback is the build stamped into the
        /// loaded save, which is 0 until the player's first save.
        /// </summary>
        private static int ReadBuildNumber()
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

            var instance = SaveGameManager.Current;
            return instance != null ? instance.buildNumberAtLastSave : 0;
        }

    }
}
