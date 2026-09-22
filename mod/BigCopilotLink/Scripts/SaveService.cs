using System;
using System.Globalization;
using System.IO;
using System.Threading;
using UnityEngine;

namespace BigCopilotLink
{
    /// <summary>Why a refresh did not start.</summary>
    public enum RefreshOutcome
    {
        Started,
        Throttled,
        CannotSave
    }

    /// <summary>
    /// What <see cref="SaveService.TryStartRefresh"/> answers. A struct so it can cross
    /// the dispatcher without allocating; C# 9, so no record and no init accessors.
    /// </summary>
    public struct RefreshResult
    {
        public readonly RefreshOutcome Outcome;

        /// <summary>Seconds the client should wait, when throttled.</summary>
        public readonly int RetryAfterSeconds;

        /// <summary>One of the reasons docs/game-link-api.md names, when the game refuses.</summary>
        public readonly string Reason;

        private RefreshResult(RefreshOutcome outcome, int retryAfterSeconds, string reason)
        {
            Outcome = outcome;
            RetryAfterSeconds = retryAfterSeconds;
            Reason = reason;
        }

        public static RefreshResult Started()
        {
            return new RefreshResult(RefreshOutcome.Started, 0, null);
        }

        public static RefreshResult Throttled(int retryAfterSeconds)
        {
            return new RefreshResult(RefreshOutcome.Throttled, retryAfterSeconds, null);
        }

        public static RefreshResult CannotSave(string reason)
        {
            return new RefreshResult(RefreshOutcome.CannotSave, 0, reason);
        }
    }

    /// <summary>
    /// One refresh, immutable: what /save serves and what /health reports about it.
    /// </summary>
    public sealed class Snapshot
    {
        public static readonly Snapshot None = new Snapshot(Array.Empty<byte>(), "", 0, null);

        /// <summary>The gzipped .hsg; empty before the first refresh.</summary>
        public readonly byte[] Bytes;

        /// <summary>Opaque; "" before the first refresh.</summary>
        public readonly string Stamp;

        /// <summary>The in-game day the bytes were taken on.</summary>
        public readonly int Day;

        /// <summary>ISO-8601 UTC, or null before the first refresh.</summary>
        public readonly string RefreshedAtUtcIso;

        public Snapshot(byte[] bytes, string stamp, int day, string refreshedAtUtcIso)
        {
            Bytes = bytes;
            Stamp = stamp;
            Day = day;
            RefreshedAtUtcIso = refreshedAtUtcIso;
        }

        public bool IsEmpty { get { return Stamp.Length == 0; } }
    }

    /// <summary>
    /// Owns the served bytes and decides when to make new ones.
    ///
    /// The serializer keeps a static SerializationContext that the game's own save
    /// thread uses, so the uncompressed write happens on the main thread while
    /// SavingGameInProgress is false: the game cannot start a save while our call is
    /// on the main thread, so the two never share the context. Compressing is
    /// stateless and runs on a pool thread; the finished bytes come back through the
    /// dispatcher.
    /// </summary>
    public sealed class SaveService
    {
        /// <summary>At most one refresh this often, whatever asks.</summary>
        private const int ThrottleSeconds = 15;

        /// <summary>A floor, so an attached board is never looking at something very old.</summary>
        private const int FloorMinutes = 5;

        /// <summary>The first refresh after the city loads.</summary>
        private const int FirstRefreshSeconds = 5;

        private static readonly DateTime UnixEpoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        // One immutable snapshot, swapped as a whole: a reader on the HTTP thread
        // takes the reference once and everything it holds belongs together.
        private volatile Snapshot _current = Snapshot.None;
        private volatile bool _busy;
        // Set by Clear(): a compress that finishes after unload publishes nothing.
        private volatile bool _cleared;

        // Main thread only.
        private readonly DateTime _loadedAtUtc = DateTime.UtcNow;
        // MinValue, not now: the first refresh must not be throttled by the load itself.
        private DateTime _lastRefreshStarted = DateTime.MinValue;
        private DateTime _lastGameSaveSeen = DateTime.MinValue;
        private int _lastHourSeen = -1;
        private bool _lastSavingInProgress;
        private bool _lastHadChanges;
        private bool _pendingAfterAttach;
        private bool _firstRefreshTriggered;
        private string _tempPath;

        /// <summary>
        /// The last refresh as one object: the gzipped .hsg, its stamp ("" before
        /// the first refresh), the in-game day it was taken on and when. Take the
        /// reference once; every field on it belongs to the same refresh.
        /// </summary>
        public Snapshot Current { get { return _current; } }

        /// <summary>True while a refresh is in flight.</summary>
        public bool Busy { get { return _busy; } }

        /// <summary>
        /// When the player's own save last finished, or DateTime.MinValue. Main thread
        /// only; kept because the trigger it feeds is the one that makes the served
        /// bytes never older than the player's own save.
        /// </summary>
        public DateTime LastGameSaveSeenUtc { get { return _lastGameSaveSeen; } }

        /// <summary>
        /// Forget the bytes on unload — they are the player's whole company. Main
        /// thread only. A compress still running publishes nothing afterwards, and
        /// the uncompressed temporary file goes with the bytes.
        /// </summary>
        public void Clear()
        {
            _cleared = true;
            _current = Snapshot.None;
            _busy = false;
            DeleteTempFile();
        }

        /// <summary>
        /// Main thread only, once a second. Works out whether anything asks for a
        /// refresh and, when a client is attached, starts one. A trigger that fires
        /// while nothing is attached is remembered, not run, so an installed mod costs
        /// a player nothing while the board is closed.
        /// </summary>
        public void PumpOnMainThread(bool attached, bool hourly)
        {
            var now = DateTime.UtcNow;

            // The hour is followed whether or not anything is attached, so returning to
            // an idle game does not look like an hour change that never happened.
            // TimeHelper is the clock /health reports too, null-safe over Current.
            var hourChanged = false;
            if (SaveGameManager.Current != null)
            {
                var hour = TimeHelper.CurrentHour;
                hourChanged = _lastHourSeen >= 0 && hour != _lastHourSeen;
                _lastHourSeen = hour;
            }

            // A completed game save shows as either edge: SavingGameInProgress
            // falling, or HasChangesSinceLastSave falling (Save() clears it last).
            // Sampling once a second can miss the first on a fast save; the second
            // stays down until the game marks another change.
            var saving = SaveGameManager.SavingGameInProgress;
            var hasChanges = SaveGameManager.HasChangesSinceLastSave();
            var gameSaveCompleted = (_lastSavingInProgress && !saving) || (_lastHadChanges && !hasChanges);
            _lastSavingInProgress = saving;
            _lastHadChanges = hasChanges;
            if (gameSaveCompleted) _lastGameSaveSeen = now;

            var firstDue = !_firstRefreshTriggered &&
                           (now - _loadedAtUtc).TotalSeconds >= FirstRefreshSeconds;
            // The floor counts from the first refresh, not from the city load.
            var floorDue = _firstRefreshTriggered &&
                           (now - _lastRefreshStarted).TotalMinutes >= FloorMinutes;

            string trigger = null;
            if (firstDue) trigger = "first";
            else if (hourly && hourChanged) trigger = "hour";
            else if (gameSaveCompleted) trigger = "game-save";
            else if (floorDue) trigger = "floor";

            if (trigger != null) _firstRefreshTriggered = true;

            if (!attached)
            {
                if (trigger != null) _pendingAfterAttach = true;
                return;
            }

            if (trigger == null)
            {
                if (!_pendingAfterAttach) return;
                trigger = "attach";
            }

            // A refresh that comes back throttled or refused stays pending, so the
            // next tick tries again: without this a client that attached inside the
            // throttle window, or during placement mode, would wait for the floor.
            // The retry is a few property reads a second, nothing more.
            var result = TryStartRefresh(trigger);
            _pendingAfterAttach = result.Outcome != RefreshOutcome.Started;
        }

        /// <summary>
        /// Main thread only. Starts a refresh, or says why it did not.
        /// </summary>
        public RefreshResult TryStartRefresh(string trigger)
        {
            var sinceLast = (DateTime.UtcNow - _lastRefreshStarted).TotalSeconds;
            if (_busy || sinceLast < ThrottleSeconds)
            {
                var remaining = ThrottleSeconds - sinceLast;
                var retryAfter = remaining > 0 ? (int)Math.Ceiling(remaining) : 1;
                return RefreshResult.Throttled(retryAfter < 1 ? 1 : retryAfter);
            }

            if (SaveGameManager.SavingGameInProgress) return RefreshResult.CannotSave("saving");
            if (!SaveGameManager.CanSave()) return RefreshResult.CannotSave(RefusalReason());

            var instance = SaveGameManager.Current;
            if (instance == null) return RefreshResult.CannotSave("other");

            string tempPath;
            try
            {
                tempPath = PrepareTempPath();
            }
            catch (Exception e)
            {
                LinkMod.LogError("could not prepare the temporary file: " + e);
                return RefreshResult.CannotSave("other");
            }

            // Captured here because the pool thread may not touch the game; the
            // same clock as /health and the hour trigger.
            var day = TimeHelper.CurrentDay;
            var hour = TimeHelper.CurrentHour;

            _busy = true;
            _lastRefreshStarted = DateTime.UtcNow;

            bool written;
            try
            {
                written = SaveGameSerializationHelper.SerializeBinaryData(tempPath, instance, false);
            }
            catch (Exception e)
            {
                _busy = false;
                DeleteTempFile();
                LinkMod.LogError("serializing the game failed (" + trigger + "): " + e);
                return RefreshResult.CannotSave("other");
            }

            if (!written)
            {
                _busy = false;
                DeleteTempFile();
                LinkMod.LogWarn("the game declined to serialize (" + trigger + "); keeping the previous bytes.");
                return RefreshResult.CannotSave("other");
            }

            ThreadPool.QueueUserWorkItem(delegate { CompressOnPoolThread(tempPath, day, hour); });
            return RefreshResult.Started();
        }

        /// <summary>
        /// Which of the three states CanSave() names, when we can tell. Qualified from
        /// the global namespace because "using UnityEngine" also brings a "UI" into
        /// scope, and these are the game's.
        /// </summary>
        private static string RefusalReason()
        {
            if (global::UI.InteriorDesigner.InteriorDesignerUI.IsOpen) return "interior";
            if (global::BigAmbitions.PlacementSystem.PlacementSystem.IsInPlacementMode) return "placement";
            if (global::CasinoBoatManager.IsOnCasinoBoat) return "casino";
            return "other";
        }

        /// <summary>Main thread only: Application.temporaryCachePath is a Unity API.</summary>
        private string PrepareTempPath()
        {
            if (_tempPath == null)
            {
                var folder = Path.Combine(Application.temporaryCachePath, "BigCopilotLink");
                Directory.CreateDirectory(folder);
                _tempPath = Path.Combine(folder, "live.bin");
            }
            DeleteTempFile();
            return _tempPath;
        }

        /// <summary>
        /// The uncompressed copy is the player's whole company: every path that
        /// stops short of the gzip step removes it. Any thread; File is not Unity.
        /// </summary>
        private void DeleteTempFile()
        {
            var path = _tempPath;
            if (path == null) return;
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("could not delete the temporary file: " + e.Message);
            }
        }

        /// <summary>
        /// Pool thread. Reads the uncompressed stream the main thread just wrote,
        /// gzips it with the game's own call, and hands the result back.
        /// </summary>
        private void CompressOnPoolThread(string tempPath, int day, int hour)
        {
            try
            {
                byte[] raw;
                try
                {
                    raw = File.ReadAllBytes(tempPath);
                }
                finally
                {
                    // The uncompressed copy is the player's whole company; do not
                    // leave it lying in the cache any longer than the gzip step needs.
                    DeleteTempFile();
                }

                var gz = SaveGameSerializationHelper.CompressBytes(raw);
                if (gz == null) throw new InvalidOperationException("CompressBytes returned null");

                var now = DateTime.UtcNow;
                var unixSeconds = (long)(now - UnixEpoch).TotalSeconds;
                var stamp = day.ToString(CultureInfo.InvariantCulture) + "-" +
                            hour.ToString(CultureInfo.InvariantCulture) + "-" +
                            unixSeconds.ToString(CultureInfo.InvariantCulture);
                var iso = now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

                // One reference swap publishes everything at once, so a reader can
                // never pair new bytes with an old stamp. A city unloaded meanwhile
                // (Clear ran) gets nothing: the bytes would outlive the game.
                var next = new Snapshot(gz, stamp, day, iso);
                MainThreadDispatcher.Enqueue(delegate
                {
                    if (_cleared) return;
                    _current = next;
                    _busy = false;
                });
            }
            catch (Exception e)
            {
                LinkMod.LogError("compressing the save failed: " + e);
                // The flag is the main thread's to write, like the publish.
                MainThreadDispatcher.Enqueue(delegate { _busy = false; });
            }
        }
    }
}
