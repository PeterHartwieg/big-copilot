using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace BigCopilotLink
{
    /// <summary>A status and a JSON body, ready for the listener to send.</summary>
    public struct WriteAnswer
    {
        public readonly int Status;
        public readonly string Json;

        public WriteAnswer(int status, string json)
        {
            Status = status;
            Json = json;
        }

        public static WriteAnswer Error(int status, string error)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", error);
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }

        public static WriteAnswer BadRequest(string detail)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", "bad_request");
            w.Prop("detail", detail);
            w.EndObject();
            return new WriteAnswer(400, w.ToString());
        }
    }

    /// <summary>An address as the wire carries it: the building registration's two fields.</summary>
    public struct WireAddress
    {
        public readonly string Street;
        public readonly int Number;

        public WireAddress(string street, int number)
        {
            Street = street;
            Number = number;
        }

        public bool Is(string street, int number)
        {
            return string.Equals(Street, street, StringComparison.Ordinal) && Number == number;
        }
    }

    /// <summary>
    /// POST /write/* (docs/game-link-api.md, "Writes"): the approval check, the body, the
    /// parse, and the trip to the main thread, for every kind; the kinds themselves are
    /// UniformWrite, ImportWrite, ScheduleWrite and (from 0.3.0) HireWrite. One per city
    /// load, like SaveService: the undo it keeps belongs to that city session. A hire has
    /// no undo.
    ///
    /// Threading. The handler threads parse the body and touch nothing of the game. The
    /// check-and-apply runs whole on the main thread, and only while no refresh is in
    /// flight: the worker-thread walk reads the very lists a write changes. The main
    /// thread must never block waiting for that walk, because the walk publishes through
    /// the main thread; so a job that finds Busy returns at once, touching nothing, and
    /// the handler asks again a moment later, for up to three seconds. Walks only start
    /// on the main thread, so a job that saw Busy down runs to its end before any walk
    /// can begin. The refresh a write asks for is queued behind the job, not run inside
    /// it, so a main-thread serialize (the fallback path) never lengthens the write.
    /// </summary>
    public sealed class WriteService
    {
        public static readonly string[] Kinds = { "uniforms", "imports", "schedule", "hire" };

        private const int MaxBodyBytes = 256 * 1024;

        /// <summary>How long a write waits out a refresh in flight before answering busy.</summary>
        private const int BusyWaitMs = 3000;

        private const int BusyRetryMs = 100;

        private readonly SaveService _saves;
        private readonly ApprovalService _approvals;

        // Main thread only: what undo restores, one per kind, for this city session.
        internal UniformWrite.UndoState UniformUndo;
        internal ImportWrite.UndoState ImportUndo;
        internal ScheduleWrite.UndoState ScheduleUndo;

        public WriteService(SaveService saves, ApprovalService approvals)
        {
            _saves = saves;
            _approvals = approvals;
        }

        /// <summary>Main thread, on unload: nothing of this city is kept.</summary>
        public void Clear()
        {
            UniformUndo = null;
            ImportUndo = null;
            ScheduleUndo = null;
        }

        // ---- the HTTP side ---------------------------------------------------------

        /// <summary>
        /// An HTTP pool thread. <paramref name="kind"/> is "uniforms", "imports",
        /// "schedule", "hire" or "undo". Every answer comes back as a status and a body;
        /// the listener writes it.
        /// </summary>
        public WriteAnswer Handle(HttpListenerRequest request, string kind)
        {
            // The approval before the body: a caller without one learns nothing more.
            if (!_approvals.IsApproved(request)) return WriteAnswer.Error(401, "not_paired");

            string text;
            if (!TryReadBody(request, MaxBodyBytes, out text)) return WriteAnswer.Error(413, "too_large");

            Func<WriteService, bool, WriteAnswer> job;
            bool dryRun;
            try
            {
                if (text == null) throw new BadRequestException("the body is not UTF-8");
                var root = JsonReader.Obj(JsonReader.Parse(text), "body");
                dryRun = JsonReader.Bool(root, "dryRun", "body", false);
                job = Prepare(kind, root);
            }
            catch (BadRequestException e)
            {
                return WriteAnswer.BadRequest(e.Message);
            }

            // Nothing to ask the game: a hire is never undone.
            if (job == NoUndo) return WriteAnswer.Error(409, "no_undo");

            return RunOnMainThread(job, dryRun);
        }

        /// <summary>HTTP thread: the parse, into plain data the main thread then checks against the game.</summary>
        private static Func<WriteService, bool, WriteAnswer> Prepare(string kind, Dictionary<string, object> root)
        {
            switch (kind)
            {
                case "uniforms":
                {
                    var req = UniformWrite.Parse(root);
                    return (ws, dryRun) => UniformWrite.Run(ws, req, dryRun);
                }
                case "imports":
                {
                    var req = ImportWrite.Parse(root);
                    return (ws, dryRun) => ImportWrite.Run(ws, req, dryRun);
                }
                case "schedule":
                {
                    var req = ScheduleWrite.Parse(root);
                    return (ws, dryRun) => ScheduleWrite.Run(ws, req, dryRun);
                }
                case "hire":
                {
                    var req = HireWrite.Parse(root);
                    return (ws, dryRun) => HireWrite.Run(ws, req, dryRun);
                }
                default:
                {
                    var target = JsonReader.Str(root, "kind", "body", true);
                    if (Array.IndexOf(Kinds, target) < 0)
                        throw new BadRequestException("body.kind must be one of uniforms, imports, schedule, hire");
                    if (target == "hire") return NoUndo;
                    return (ws, dryRun) => ws.Undo(target, dryRun);
                }
            }
        }

        /// <summary>The undo of a hire: answered 409 no_undo by Handle, never run.</summary>
        private static readonly Func<WriteService, bool, WriteAnswer> NoUndo = (ws, dryRun) => WriteAnswer.Error(409, "no_undo");

        /// <summary>
        /// Null text when the bytes are not UTF-8; false when the body is over the cap.
        /// Reads at most one chunk past the cap, whatever Content-Length claims.
        /// </summary>
        internal static bool TryReadBody(HttpListenerRequest request, int maxBytes, out string text)
        {
            text = null;
            if (request.ContentLength64 > maxBytes) return false;

            var buffer = new MemoryStream();
            var chunk = new byte[8192];
            var input = request.InputStream;
            int read;
            while ((read = input.Read(chunk, 0, chunk.Length)) > 0)
            {
                buffer.Write(chunk, 0, read);
                if (buffer.Length > maxBytes) return false;
            }

            try
            {
                text = new UTF8Encoding(false, true).GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
                // A browser never sends one, but an editor might put it there.
                if (text.Length > 0 && text[0] == '﻿') text = text.Substring(1);
            }
            catch (ArgumentException)
            {
                text = null;
            }
            return true;
        }

        /// <summary>
        /// Hands the job to the main thread and waits, retrying while a refresh is in
        /// flight. A job the main thread has not started by the deadline is withdrawn
        /// (JobBox), so a 503 always means nothing was written.
        /// </summary>
        private WriteAnswer RunOnMainThread(Func<WriteService, bool, WriteAnswer> job, bool dryRun)
        {
            var clock = System.Diagnostics.Stopwatch.StartNew();
            while (true)
            {
                var box = new JobBox(this, job, dryRun);
                Task<WriteAnswer?> task;
                bool done;
                try
                {
                    task = MainThreadDispatcher.RunOnMainThread<WriteAnswer?>(box.Run);
                    var left = BusyWaitMs - (int)clock.ElapsedMilliseconds;
                    done = task.Wait(left > 0 ? left : 0);
                    if (!done)
                    {
                        // Not taken in time (mid-load, a long frame). Withdraw it, and
                        // "busy" is then the truth: it will never run. If the main thread
                        // got there first the job has started, and a started job may
                        // write, so its own answer is the only honest one: wait for it,
                        // however long. It runs in one go within one frame.
                        if (box.TryWithdraw()) return WriteAnswer.Error(503, "busy");
                        task.Wait();
                    }
                }
                catch (Exception e)
                {
                    // A faulted task: no city is loaded any more (the dispatcher refused it).
                    LinkMod.LogWarn("a write could not reach the main thread: " + e.GetType().Name);
                    return WriteAnswer.Error(503, "main_thread_unavailable");
                }

                var answer = task.Result;
                if (answer.HasValue) return answer.Value;

                // A refresh was in flight. Ask again shortly, inside the three seconds.
                if (clock.ElapsedMilliseconds + BusyRetryMs >= BusyWaitMs) return WriteAnswer.Error(503, "busy");
                Thread.Sleep(BusyRetryMs);
            }
        }

        /// <summary>
        /// One trip to the main thread. Pending until the main thread starts it; a handler
        /// that gave up withdraws it first, and a withdrawn job does nothing when the main
        /// thread reaches it.
        /// </summary>
        private sealed class JobBox
        {
            private const int Pending = 0, Running = 1, Withdrawn = 2;

            private readonly WriteService _owner;
            private readonly Func<WriteService, bool, WriteAnswer> _job;
            private readonly bool _dryRun;
            private int _state;

            public JobBox(WriteService owner, Func<WriteService, bool, WriteAnswer> job, bool dryRun)
            {
                _owner = owner;
                _job = job;
                _dryRun = dryRun;
            }

            public bool TryWithdraw()
            {
                return Interlocked.CompareExchange(ref _state, Withdrawn, Pending) == Pending;
            }

            /// <summary>Main thread. Null means "a refresh is in flight, ask again".</summary>
            public WriteAnswer? Run()
            {
                if (Interlocked.CompareExchange(ref _state, Running, Pending) != Pending) return null;
                return _owner.Gate(_job, _dryRun);
            }
        }

        // ---- the main-thread side --------------------------------------------------

        /// <summary>
        /// Main thread. Busy first, before anything is read: the walk and a write must
        /// never overlap. A dry run only reads, so the game saving or a state that
        /// cannot save does not stop it; the contract promises a paired, well-formed dry
        /// run a 200. An apply is refused in those states with SaveService's reasons.
        /// </summary>
        private WriteAnswer? Gate(Func<WriteService, bool, WriteAnswer> job, bool dryRun)
        {
            if (_saves.Busy) return null;
            if (SaveGameManager.Current == null) return CannotWrite("other");
            if (!dryRun)
            {
                if (SaveGameManager.SavingGameInProgress) return CannotWrite("saving");
                if (!SaveService.CanSaveNow()) return CannotWrite(SaveService.RefusalReason());
            }

            try
            {
                return job(this, dryRun);
            }
            catch (Exception e)
            {
                // Every rule is checked before the first field changes, and the game's
                // follow-up calls after it are guarded one by one, so a throw here is a
                // game member behaving unlike its build-3680 IL. The log has it; the
                // page hears "other", as for a refresh the mod failed to start.
                LinkMod.LogError("a write failed on the main thread: " + e);
                return CannotWrite("other");
            }
        }

        internal static WriteAnswer CannotWrite(string reason)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", "cannot_write");
            w.Prop("reason", reason);
            w.EndObject();
            return new WriteAnswer(409, w.ToString());
        }

        private WriteAnswer Undo(string kind, bool dryRun)
        {
            switch (kind)
            {
                case "uniforms":
                    if (UniformUndo == null) return WriteAnswer.Error(409, "nothing_to_undo");
                    return UniformWrite.Undo(this, UniformUndo, dryRun);
                case "imports":
                    if (ImportUndo == null) return WriteAnswer.Error(409, "nothing_to_undo");
                    return ImportWrite.Undo(this, ImportUndo, dryRun);
                default:
                    if (ScheduleUndo == null) return WriteAnswer.Error(409, "nothing_to_undo");
                    return ScheduleWrite.Undo(this, ScheduleUndo, dryRun);
            }
        }

        /// <summary>
        /// Main thread, right after a write (or an undo) changed the game: what the
        /// game's own UI does after an edit, a notification so the player sees who did
        /// it, and a refresh so the page rebuilds from the written state. Answers the
        /// stamp before that refresh, which the page watches /health move away from.
        /// </summary>
        internal string Applied(string notificationKey, string business)
        {
            return Applied(notificationKey, new Dictionary<string, string> { { "business", business ?? "" } });
        }

        /// <summary>Applied, for a notification with several {placeholders}.</summary>
        internal string Applied(string notificationKey, Dictionary<string, string> data)
        {
            try
            {
                SaveGameManager.MarkChange();
            }
            catch (Exception e)
            {
                LinkMod.LogError("MarkChange after a write failed: " + e.Message);
            }

            Notify(notificationKey, data);
            return RefreshAfterWrite();
        }

        /// <summary>
        /// Main thread. The refresh alone, for an apply that found nothing to change: the
        /// page still waits for the stamp to move, so it must move.
        /// </summary>
        internal string RefreshAfterWrite()
        {
            // Only refreshes publish a stamp, and none is in flight (the gate checked
            // Busy), so this is the stamp before the refresh queued next.
            var stamp = _saves.Current.Stamp;
            var saves = _saves;
            MainThreadDispatcher.Enqueue(delegate { saves.TryStartRefreshAfterWrite(); });
            return stamp;
        }

        /// <summary>Main thread. An in-game notification from a Locales/en.json key with one {placeholder}.</summary>
        internal static void Notify(string key, string argument, string value)
        {
            Notify(key, new Dictionary<string, string> { { argument, value ?? "" } });
        }

        /// <summary>Main thread. An in-game notification from a Locales/en.json key with its {placeholders}.</summary>
        internal static void Notify(string key, Dictionary<string, string> data)
        {
            try
            {
                // Not tracked on the save game: the notification is about this session.
                global::UI.Notification.Notifications.Show(
                    global::UI.Notification.NotificationType.Success, key, data, 5f, null, null, true, false);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("could not show a notification: " + e.Message);
            }
        }

        // ---- shared by the kinds ---------------------------------------------------

        /// <summary>HTTP thread: {"street", "number"} at <paramref name="key"/>.</summary>
        internal static WireAddress ParseAddress(Dictionary<string, object> obj, string key, string path)
        {
            var address = JsonReader.Obj(JsonReader.Get(obj, key), path + "." + key);
            var street = JsonReader.Str(address, "street", path + "." + key, true);
            var number = JsonReader.Num(address, "number", path + "." + key);
            if (!JsonReader.IsWhole(number, int.MinValue, int.MaxValue))
                throw new BadRequestException(path + "." + key + ".number must be a whole number");
            return new WireAddress(street, (int)number);
        }

        /// <summary>
        /// Main thread. The registration at an address, or null. A plain search of the
        /// list, never BuildingHelper.GetBuildingRegistration: that creates a
        /// registration for a building that has none, and a dry run must change nothing.
        /// </summary>
        internal static BuildingRegistration FindRegistration(WireAddress address)
        {
            var instance = SaveGameManager.Current;
            if (instance == null || instance.BuildingRegistrations == null) return null;
            var list = instance.BuildingRegistrations;
            for (var i = 0; i < list.Count; i++)
            {
                var r = list[i];
                if (r != null && address.Is(r.StreetName, r.StreetNumber)) return r;
            }
            return null;
        }

        /// <summary>Main thread. The registration at a game Address, without creating one.</summary>
        internal static BuildingRegistration FindRegistration(Address address)
        {
            if (address == null) return null;
            return FindRegistration(new WireAddress(address.streetName, address.streetNumber));
        }

        internal static Address GameAddress(BuildingRegistration registration)
        {
            return new Address(registration.StreetName, registration.StreetNumber);
        }

        internal static void WriteAddress(JsonWriter w, string key, string street, int number)
        {
            w.BeginObject(key);
            w.Prop("street", street);
            w.Prop("number", number);
            w.EndObject();
        }

        internal static void WriteAddress(JsonWriter w, string key, Address address)
        {
            if (address == null || string.IsNullOrEmpty(address.streetName))
            {
                w.PropNull(key);
                return;
            }
            WriteAddress(w, key, address.streetName, address.streetNumber);
        }

        internal static bool SameAddress(Address a, Address b)
        {
            var aEmpty = a == null || string.IsNullOrEmpty(a.streetName);
            var bEmpty = b == null || string.IsNullOrEmpty(b.streetName);
            if (aEmpty || bEmpty) return aEmpty && bEmpty;
            return string.Equals(a.streetName, b.streetName, StringComparison.Ordinal) && a.streetNumber == b.streetNumber;
        }

        internal static string Count(int n, string one, string many)
        {
            return n.ToString(CultureInfo.InvariantCulture) + " " + (n == 1 ? one : many);
        }

        // ---- is the player looking at it? ------------------------------------------

        private static readonly FieldInfo PlanUiCurrent = typeof(global::UI.Smartphone.Apps.BizMan.PurchasingAgent.PurchasingAgentPlanUI)
            .GetField("_currentImportPartnership", BindingFlags.Instance | BindingFlags.NonPublic);

        private static readonly FieldInfo ScheduleAutoFillers = typeof(global::UI.Smartphone.Apps.BizMan.Schedule.BizManSchedule)
            .GetField("_activeAutoFillers", BindingFlags.Instance | BindingFlags.NonPublic);

        private static global::UI.Smartphone.FullMenu FullMenu()
        {
            var uis = global::UI.UIs.Instance;
            return uis != null ? uis.fullMenu : null;
        }

        /// <summary>
        /// Main thread. True while the BizMan schedule is on screen for this business, or
        /// the game's schedule auto-fill is still filling it. The screen is
        /// UIs.fullMenu.schedule, active only while shown (its OnDisable is the game's
        /// "screen closed" work); which business it shows is ScheduleHelper.Business, set
        /// by that screen's Awake and never cleared, so it is only read while the screen
        /// is active. Its caches (WorkShiftsByEmployeeId and the rest) would not see a
        /// write, which is why the write refuses.
        /// </summary>
        internal static bool ScheduleScreenOpenOn(BuildingRegistration registration)
        {
            var menu = FullMenu();
            var screen = menu != null ? menu.schedule : null;
            if (screen == null) return false; // Unity null: destroyed, or never built

            if (screen.isActiveAndEnabled)
            {
                var business = global::UI.Smartphone.Apps.BizMan.Schedule.ScheduleHelper.Business;
                if (business != null && ReferenceEquals(business.buildingRegistration, registration)) return true;
            }

            // An auto-fill keeps running after the screen closes (only OnDestroy cancels
            // it) and writes this business's shifts across frames.
            if (ScheduleAutoFillers != null)
            {
                var fillers = ScheduleAutoFillers.GetValue(screen) as System.Collections.IEnumerable;
                if (fillers != null)
                {
                    foreach (var f in fillers)
                    {
                        var filler = f as global::Buildings.Schedule.ScheduleAutoFiller;
                        if (filler != null && ReferenceEquals(filler.Registration, registration)) return true;
                    }
                }
            }
            return false;
        }

        private static global::UI.Smartphone.Apps.BizMan.PurchasingAgentsPlanList PlanList()
        {
            var menu = FullMenu();
            if (menu == null || menu.bizMan == null || menu.bizMan.business == null) return null;
            return menu.bizMan.business.purchasingAgentsPlanList;
        }

        /// <summary>
        /// Main thread. True while the purchasing-agent plan screen shows this contract:
        /// the list's PurchasingAgentPlanUI is active and its private
        /// _currentImportPartnership (set by LoadPlan, never cleared; Hide only
        /// deactivates) is this one.
        /// </summary>
        internal static bool PlanScreenOpenOn(Entities.ImportPartnership contract)
        {
            var list = PlanList();
            var ui = list != null ? list.purchasingAgentPlanUISettings : null;
            if (ui == null || !ui.gameObject.activeInHierarchy || PlanUiCurrent == null) return false;
            return ReferenceEquals(PlanUiCurrent.GetValue(ui), contract);
        }

        /// <summary>
        /// Main thread. True while the phone's MyEmployees app is on screen:
        /// UIs.fullMenu.myEmployees (a MonoBehaviour) active and enabled. FullMenu.SelectApp
        /// deactivates every other app under appsContainer and activates the chosen one,
        /// and closing the full menu deactivates the whole menu when its fade ends
        /// (FullMenu.Toggle's onComplete), so this holds exactly while the app is shown.
        /// Its candidate list and mass-action selection are built when it opens (OnEnable,
        /// ChangeTab, LoadList a frame later) and would go stale under a hire, which is
        /// why the hire write refuses while it is open. Unverified in the game: Peter's
        /// 0.3.0 checklist item 2.
        /// </summary>
        internal static bool MyEmployeesOpen()
        {
            var menu = FullMenu();
            var app = menu != null ? menu.myEmployees : null;
            return app != null && app.isActiveAndEnabled; // Unity null: destroyed, or never built
        }

        /// <summary>
        /// Main thread. True while a headquarters' purchasing-agent list is on screen. Its
        /// drag-to-reorder maps list rows to importPartnerships by position, so a
        /// reorder under it would put the player's next drag in the wrong place.
        /// </summary>
        internal static bool PlanListOpen()
        {
            var list = PlanList();
            return list != null && list.gameObject.activeInHierarchy;
        }
    }
}
