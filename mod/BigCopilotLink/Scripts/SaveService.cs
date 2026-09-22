using System;
using System.Globalization;
using System.IO;
using System.Threading;

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
    /// The serialize and the gzip both run on one worker thread of their own, walking
    /// the live game with a private SerializationContext; the main thread only decides
    /// when, and captures the in-game clock before the walk starts. A walk that throws
    /// because the game changed state under it is retried once, and after two
    /// consecutive failures the session falls back to serializing on the main thread,
    /// where nothing moves under the walk. The finished bytes come back through the
    /// dispatcher as one immutable Snapshot.
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
        private int _lastHourSeen = -1;
        private bool _lastSavingInProgress;
        private bool _lastHadChanges;
        private bool _pendingAfterAttach;
        private bool _firstRefreshTriggered;
        // The worker-thread walk reads live state the main thread keeps changing; a walk
        // that throws is one failure. Two in a row and this city session goes back to
        // the main-thread path: a stall, but bytes that always arrive. After ten
        // main-thread refreshes the worker gets one more chance, so a bad minute does
        // not cost a whole evening; one more failure and it is back to the main thread.
        private int _backgroundFailures;
        private bool _backgroundSerialize = true;
        private int _fallbackRuns;
        private const int BackgroundFailuresBeforeFallback = 2;
        private const int FallbackRunsBeforeReprobe = 10;
        // A failed walk asks for one more try when the throttle window lifts. Any
        // refresh that starts spends it, whatever asked for that refresh.
        private bool _retryPending;
        // The uncompressed size of the last refresh, so the next stream is allocated
        // once instead of doubling its way up through the large-object heap. Written by
        // the worker, read by the next one; a stale value costs one extra growth step.
        private volatile int _lastRawLength;

        /// <summary>
        /// The last refresh as one object: the gzipped .hsg, its stamp ("" before
        /// the first refresh), the in-game day it was taken on and when. Take the
        /// reference once; every field on it belongs to the same refresh.
        /// </summary>
        public Snapshot Current { get { return _current; } }

        /// <summary>True while a refresh is in flight.</summary>
        public bool Busy { get { return _busy; } }

        /// <summary>
        /// Forget the bytes on unload — they are the player's whole company. Main
        /// thread only. A serialize or compress still running publishes nothing
        /// afterwards. A /save already past taking the snapshot finishes writing it;
        /// no new reader gets it.
        /// </summary>
        public void Clear()
        {
            _cleared = true;
            _current = Snapshot.None;
            _busy = false;
        }

        private bool _lastLoading;
        private bool _lastInside;
        private bool _insideKnown;

        /// <summary>
        /// Main thread, every frame. Two moments the player already sees as a
        /// pause, so a serialize there costs nothing visible: the first frame of
        /// the city's loading spinner (CityManager.DelayEnterBuilding), and the
        /// frame on which the player's inside/outside state flips. Entering and
        /// leaving a building both fade the screen to black, load, and fade back
        /// (BuildingManager.EnterBuildingCoroutine, ExitFromBuildingCoroutine);
        /// IsInsideBuilding changes under the black, so whatever a serialize costs
        /// lands there. These pass the fifteen-second window. Only while a client is
        /// attached.
        /// </summary>
        public void FrameOnMainThread(bool attached, bool onBuildingLoad)
        {
            var loading = global::LoadingSpinner.isLoading;
            var spinnerRising = loading && !_lastLoading;
            _lastLoading = loading;

            var inside = global::BuildingManager.IsInsideBuilding;
            var flipped = _insideKnown && inside != _lastInside;
            _lastInside = inside;
            _insideKnown = true;

            if (!(spinnerRising || flipped) || !onBuildingLoad) return;
            if (!attached)
            {
                _pendingAfterAttach = true;
                return;
            }
            TryStartRefresh(flipped ? (inside ? "enter" : "leave") : "loading", true);
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
            // falling, or HasChangesSinceLastSave falling (Save() clears it last;
            // SerializeBinaryData, which the game's helper calls, does not touch it:
            // its IL calls only File, GZipStream, the Odin serializer and Debug).
            // Sampling once a second can miss the first on a fast save; the second
            // stays down until the game marks another change. The two edges of one
            // save can land on different ticks; the second then asks for a refresh
            // the throttle refuses, and the pending retry runs it when the window
            // lifts. One spare serialization per save is the price of never
            // dropping a real second save that close behind.
            var saving = SaveGameManager.SavingGameInProgress;
            bool hasChanges;
            try
            {
                hasChanges = SaveGameManager.HasChangesSinceLastSave();
            }
            catch (NullReferenceException)
            {
                // On exit to desktop the pump gets one more tick after the player
                // object is gone, and this call walks the player's position. Not an
                // edge, not an error: the same answer as last time.
                hasChanges = _lastHadChanges;
            }
            var gameSaveCompleted = (_lastSavingInProgress && !saving) || (_lastHadChanges && !hasChanges);
            _lastSavingInProgress = saving;
            _lastHadChanges = hasChanges;

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
                if (_retryPending) trigger = "retry";
                else if (_pendingAfterAttach) trigger = "attach";
                else return;
            }

            // A refresh that comes back throttled or refused stays pending, so the next
            // tick tries again: without this a client that attached inside the
            // throttle window, or during placement mode, would wait for the floor.
            // The retry is a few property reads a second, nothing more. A start clears
            // both flags inside TryStartRefresh; a retry that does not start is still
            // set, and any other trigger that does not start becomes pending.
            var result = TryStartRefresh(trigger);
            if (result.Outcome != RefreshOutcome.Started && trigger != "retry") _pendingAfterAttach = true;
        }

        /// <summary>
        /// Main thread only. Starts a refresh, or says why it did not.
        /// </summary>
        public RefreshResult TryStartRefresh(string trigger)
        {
            return TryStartRefresh(trigger, false);
        }

        /// <summary>
        /// Main thread only. A trigger whose stall is hidden anyway (a building load
        /// screen) may pass the fifteen-second window; nothing passes Busy.
        /// </summary>
        public RefreshResult TryStartRefresh(string trigger, bool pastWindow)
        {
            var sinceLast = (DateTime.UtcNow - _lastRefreshStarted).TotalSeconds;
            if (_busy || (!pastWindow && sinceLast < ThrottleSeconds))
            {
                var remaining = ThrottleSeconds - sinceLast;
                var retryAfter = remaining > 0 ? (int)Math.Ceiling(remaining) : 1;
                return RefreshResult.Throttled(retryAfter < 1 ? 1 : retryAfter);
            }

            if (SaveGameManager.SavingGameInProgress) return RefreshResult.CannotSave("saving");
            if (!CanSaveNow()) return RefreshResult.CannotSave(RefusalReason());

            var instance = SaveGameManager.Current;
            if (instance == null) return RefreshResult.CannotSave("other");

            // Captured here because the worker threads may not touch the game; the
            // same clock as /health and the hour trigger.
            var day = TimeHelper.CurrentDay;
            var hour = TimeHelper.CurrentHour;

            _busy = true;
            _lastRefreshStarted = DateTime.UtcNow;
            // Whatever asked, this refresh answers it: a retry left set here would buy a
            // second serialize nothing wants once the window lifts.
            _retryPending = false;
            _pendingAfterAttach = false;

            // A trigger past the window is a building load: the frame is black and the
            // load coroutine is rewriting the very state a walk would read, so that
            // refresh runs on the main thread, where the stall is hidden and the bytes
            // are certain. It also keeps those failures out of the worker's count.
            if (_backgroundSerialize && !pastWindow)
            {
                // The whole job on its own thread: walk, gzip, publish. Its own
                // thread, not the pool: the listener's handlers share the pool and a
                // flood of them must not hold Busy hostage. BelowNormal, so it never
                // competes with the frame.
                try
                {
                    var worker = new Thread(delegate () { SerializeAndCompressOnWorkerThread(instance, day, hour, trigger); });
                    worker.Name = "BigCopilotLink.Serialize";
                    worker.IsBackground = true;
                    worker.Priority = ThreadPriority.BelowNormal;
                    worker.Start();
                }
                catch (Exception e)
                {
                    // No thread means nothing will ever clear Busy; clear it here.
                    _busy = false;
                    LinkMod.LogError("could not start the serialize thread (" + trigger + "): " + e);
                    return RefreshResult.CannotSave("other");
                }
                return RefreshResult.Started();
            }

            // The walk on the main thread, where nothing moves under it: a building
            // load, or the fallback after the worker failed twice.
            byte[] raw;
            var clock = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                raw = SerializeToBytes(instance);
            }
            catch (Exception e)
            {
                _busy = false;
                LinkMod.LogError("serializing the game failed on the main thread (" + trigger + "): " + e);
                return RefreshResult.CannotSave("other");
            }
            LinkMod.LogInfo("serialized in " + clock.ElapsedMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms on the main thread (" + trigger + ")");

            // Counts toward the re-probe only when the fallback chose this thread, not
            // when a building load did.
            var fallbackRun = !_backgroundSerialize;
            try
            {
                var compressor = new Thread(delegate () { CompressAndPublishOnWorkerThread(raw, day, hour, false, fallbackRun); });
                compressor.Name = "BigCopilotLink.Compress";
                compressor.IsBackground = true;
                compressor.Priority = ThreadPriority.BelowNormal;
                compressor.Start();
            }
            catch (Exception e)
            {
                _busy = false;
                LinkMod.LogError("could not start the compress thread (" + trigger + "): " + e);
                return RefreshResult.CannotSave("other");
            }
            return RefreshResult.Started();
        }

        // SaveGameManager.CanSave() is private static on build 3680 (verified on the
        // Mac compile), so it is reached by reflection, looked up once. Should a later
        // build rename or drop it, the public states it checks stand in: the interior
        // designer, placement mode, the casino boat and the player-activity panel.
        private static readonly System.Reflection.MethodInfo CanSaveMethod =
            typeof(SaveGameManager).GetMethod("CanSave",
                System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Public);

        private static bool CanSaveNow()
        {
            if (CanSaveMethod != null)
            {
                try
                {
                    return (bool)CanSaveMethod.Invoke(null, null);
                }
                catch (Exception e)
                {
                    LinkMod.LogWarn("CanSave() could not be called (" + e.Message + "); using the public checks.");
                }
            }
            return !global::UI.InteriorDesigner.InteriorDesignerUI.IsOpen
                && !global::BigAmbitions.PlacementSystem.PlacementSystem.IsInPlacementMode
                && !global::CasinoBoatManager.IsOnCasinoBoat
                && !global::PlayerActivity.PlayerActivityUI.IsPanelOpen;
        }

        /// <summary>
        /// Which of the three states CanSave() names, when we can tell. Qualified from
        /// the global namespace so that nothing a later using brings in (UnityEngine
        /// has a UI namespace) can shadow the game's.
        /// </summary>
        private static string RefusalReason()
        {
            if (global::UI.InteriorDesigner.InteriorDesignerUI.IsOpen) return "interior";
            if (global::BigAmbitions.PlacementSystem.PlacementSystem.IsInPlacementMode) return "placement";
            if (global::CasinoBoatManager.IsOnCasinoBoat) return "casino";
            return "other";
        }

        /// <summary>
        /// The bytes of the uncompressed .hsg, produced the way
        /// SaveGameSerializationHelper.SerializeBinaryData produces them (its IL, build
        /// 3680): a fresh context with the game's own SaveGameSerializationPolicy and
        /// ThrowOnErrors, internal references reset, DataFormat.Binary. A private
        /// context, not the helper's static one, so a game save that starts on the main
        /// thread mid-walk (SavingGameInProgress is checked once, when the refresh
        /// starts) shares no per-walk state with this call. What the two walks do share
        /// are OdinSerializer's process-wide caches, and those take a lock: in the
        /// shipped OdinSerializer.dll FormatterLocator.GetFormatter, Serializer.Get,
        /// FormatterUtilities.GetSerializableMembers, DefaultSerializationBinder,
        /// SerializationPolicies and FormatterEmitter all enter a Monitor (verified by
        /// IL scan, 22 Sep 2026). Any thread: Odin walks fields only and touches no
        /// Unity API for this graph.
        /// </summary>
        private byte[] SerializeToBytes(GameInstance instance)
        {
            var context = new OdinSerializer.SerializationContext();
            context.Config.SerializationPolicy = new Player.SaveSystem.SaveGameSerializationPolicy();
            context.Config.DebugContext.ErrorHandlingPolicy = OdinSerializer.ErrorHandlingPolicy.ThrowOnErrors;
            context.ResetInternalReferences();
            var capacity = _lastRawLength > 0 ? _lastRawLength + _lastRawLength / 16 : 0;
            using (var stream = new MemoryStream(capacity))
            {
                OdinSerializer.SerializationUtility.SerializeValue<GameInstance>(instance, stream, OdinSerializer.DataFormat.Binary, context);
                _lastRawLength = (int)stream.Length;
                return stream.ToArray();
            }
        }

        /// <summary>
        /// Its own thread. Walks the live game with a private context, gzips the result
        /// and publishes it. The main thread keeps playing meanwhile, so the snapshot can
        /// mix two moments a few hundred milliseconds apart (accepted: a dashboard
        /// tolerates that), and a collection that changed under the walk makes
        /// OdinSerializer throw: that is caught, the previous bytes stay, and the main
        /// thread is told so it can retry or fall back.
        /// </summary>
        private void SerializeAndCompressOnWorkerThread(GameInstance instance, int day, int hour, string trigger)
        {
            byte[] raw;
            var clock = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                raw = SerializeToBytes(instance);
                LinkMod.LogInfo("serialized in " + clock.ElapsedMilliseconds.ToString(CultureInfo.InvariantCulture) + " ms on a worker thread (" + trigger + ")");
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("background serialize failed (" + trigger + "): " + e.GetType().Name + ": " + e.Message);
                // Counters and the retry flag are the main thread's, like the publish.
                MainThreadDispatcher.Enqueue(delegate { OnBackgroundFailure(); });
                return;
            }
            // The city may have unloaded during the walk; the gzip is the longer half
            // of the job and its result would be thrown away at the publish.
            if (_cleared) return;
            CompressAndPublishOnWorkerThread(raw, day, hour, true, false);
        }

        /// <summary>Main thread only, through the dispatcher.</summary>
        private void OnBackgroundFailure()
        {
            _busy = false;
            if (_cleared) return;
            _backgroundFailures++;
            _retryPending = true;
            if (_backgroundFailures >= BackgroundFailuresBeforeFallback && _backgroundSerialize)
            {
                _backgroundSerialize = false;
                _fallbackRuns = 0;
                LinkMod.LogWarn(BackgroundFailuresBeforeFallback.ToString(CultureInfo.InvariantCulture) +
                                " background serializes in a row failed; serializing on the main thread; the worker gets another chance after " +
                                FallbackRunsBeforeReprobe.ToString(CultureInfo.InvariantCulture) + " refreshes.");
            }
        }

        /// <summary>
        /// Its own thread, or the tail of the serialize thread. Gzips the bytes the
        /// walk produced, with the game's own stateless call, and hands the result
        /// back.
        /// </summary>
        private void CompressAndPublishOnWorkerThread(byte[] raw, int day, int hour, bool fromWorker, bool fallbackRun)
        {
            try
            {
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
                // A refused enqueue means the city unloaded: Clear() already reset
                // Busy and dropped the bytes, so there is nothing left to publish.
                MainThreadDispatcher.Enqueue(delegate
                {
                    if (_cleared) return;
                    _current = next;
                    _busy = false;
                    if (fromWorker)
                    {
                        // A success ends the failure streak.
                        _backgroundFailures = 0;
                    }
                    else if (fallbackRun && !_backgroundSerialize && ++_fallbackRuns >= FallbackRunsBeforeReprobe)
                    {
                        // Enough stalls: give the worker one more chance, with one
                        // failure already on the count so a single throw ends it.
                        _backgroundSerialize = true;
                        _backgroundFailures = BackgroundFailuresBeforeFallback - 1;
                        _fallbackRuns = 0;
                        LinkMod.LogInfo("trying the worker thread again after " + FallbackRunsBeforeReprobe.ToString(CultureInfo.InvariantCulture) + " main-thread refreshes.");
                    }
                });
            }
            catch (Exception e)
            {
                LinkMod.LogError("compressing the save failed: " + e);
                // The flag is the main thread's to write, like the publish; the bytes
                // are lost, so the pump retries once the window lifts.
                MainThreadDispatcher.Enqueue(delegate { _busy = false; _retryPending = true; });
            }
        }
    }
}
