using System;
using System.Collections.Generic;
using System.Reflection;
using Entities;

namespace BigCopilotLink
{
    // Undo state capture, same-day guards and reversal of an applied hire.
    public static partial class HireWrite
    {
        // ---- the undo (0.4.0, hire.undo) ----------------------------------------------

        /// <summary>
        /// What the last applied hire call changed, taken before its moves and hires
        /// (docs/game-link-api.md, "Undoing a hire"): the game's day and hour, each
        /// written week, each mover's business and what the move took off them, each
        /// candidate's place in the list and the fields HireCandidate changes.
        /// </summary>
        public sealed class UndoState
        {
            internal int Day;
            internal int Hour;
            internal readonly List<HireUndo> Hires = new List<HireUndo>();
            internal readonly List<MoveUndo> Moves = new List<MoveUndo>();
            internal List<ScheduleWrite.UndoState> Sites = new List<ScheduleWrite.UndoState>();
            /// <summary>Each entry of Sites' print before the call; dropped once the call is kept.</summary>
            internal List<string> PrintsBefore = new List<string>();
            /// <summary>The game's once-only first-employee bonus was not used before the call.</summary>
            internal bool BonusFree;
            /// <summary>The call granted that bonus: the undo cannot take it back, so it refuses.</summary>
            internal bool GrantedBonus;
        }

        /// <summary>One hired candidate as they were before EmployeeHelper.HireCandidate.</summary>
        internal sealed class HireUndo
        {
            internal string Id;
            internal EmployeeInstance Employee;
            internal string Name;
            internal WireAddress Target;
            internal string Business;
            internal float Wage;
            internal int CandidateIndex;
            internal CandidateInfo Info;
            internal int HoursLeft;
            internal Address AssignedBefore;
            internal int DayHired;
            internal int NextSickDay;
            internal bool HasComplaintData;
            internal int HoursUntilNextComplaint;
            internal int ComplaintDeadlineHours;
            internal bool IsComplaining;
            internal bool HasRival;
            internal AI.Employees.Complaint CurrentComplaint;
            internal AI.Employees.SalaryNegotiation.CandidateSalaryNegotiation Negotiation;
            internal bool NegotiationCompleted;
            internal bool NegotiationAccepted;
            // Counters the hourly tick moves on anyone employed (EmployeeInstance.RunHourly).
            internal int WorkedHoursToday;
            internal int WorkedHoursThisWeek;
            internal int WorkedDays;
            internal float Satisfaction;
            internal int AssignedWeeklyHours;
            internal List<BigAmbitions.DayNightCycle.DayOfWeekOrdered> AssignedWeeklyDays;
            internal List<string> AssignedWorkStationItems;
            internal object LastWorkedDay;
        }

        /// <summary>One moved employee: where they came from, and what the move took off them.</summary>
        internal sealed class MoveUndo
        {
            internal string Id;
            internal EmployeeInstance Employee;
            internal string Name;
            internal WireAddress Target;
            /// <summary>Their assignedAddress before the move; null: the bench.</summary>
            internal Address Source;
            internal bool Drove;
            internal bool HadContract;
            /// <summary>The move cleared their delivery vehicle slot or cut their import contract: the undo cannot give those back.</summary>
            internal bool TookVehicle;
            internal bool TookContract;
            /// <summary>The HR manager's plan they were on at the write (assignedHrManagerPlanId), empty for none.</summary>
            internal string HrPlan;
        }

        /// <summary>EmployeeInstance.lastWorkedDay is private (build 3682); null when the field is not found.</summary>
        private static readonly FieldInfo LastWorkedDayField =
            typeof(EmployeeInstance).GetField("lastWorkedDay", BindingFlags.Instance | BindingFlags.NonPublic);

        /// <summary>Main thread, every check passed, nothing changed yet: the undo's record.</summary>
        private static UndoState RecordUndo(List<Hired> hired, List<Moved> moved, List<SiteState> sites)
        {
            var game = SaveGameManager.Current;
            var undo = new UndoState { Day = game.Day, Hour = TimeHelper.CurrentHour };
            // HireCandidate grants the game's once-only first-employee happiness bonus
            // (HappinessHelper.AddModifier, remembered in usedHappinessModifiers); an undo
            // cannot give that back.
            undo.BonusFree = hired.Count > 0 && !FirstBonusUsed(game);

            var drivers = Drivers();
            foreach (var m in moved)
            {
                undo.Moves.Add(new MoveUndo
                {
                    Id = m.Req.EmployeeId, Employee = m.Employee, Name = m.Name, Target = m.Req.To,
                    Source = m.Employee.assignedAddress,
                    Drove = drivers.Contains(m.Req.EmployeeId), HadContract = HasContract(m.Req.EmployeeId),
                    HrPlan = m.Employee.assignedHrManagerPlanId ?? ""
                });
            }

            foreach (var h in hired) undo.Hires.Add(Snapshot(h, game));

            // Every site the call writes a week for, then every move source where the
            // mover holds shifts (the move clears them there).
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var site in sites)
            {
                if (site.Week == null || !keys.Add(Key(site.Req.Address))) continue;
                undo.Sites.Add(ScheduleWrite.Record(site.Reg, site.Req.Address, site.Week.Opens));
                undo.PrintsBefore.Add(ScheduleWrite.LivePrint(site.Reg));
            }
            foreach (var m in moved)
            {
                if (m.Source == null || m.ShiftsCleared == 0 || !keys.Add(Key(m.Req.From))) continue;
                undo.Sites.Add(ScheduleWrite.Record(m.Source, m.Req.From, new HashSet<int>()));
                undo.PrintsBefore.Add(ScheduleWrite.LivePrint(m.Source));
            }
            return undo;
        }

        private static HireUndo Snapshot(Hired h, GameInstance game)
        {
            var c = h.Candidate;
            var s = new HireUndo
            {
                Id = h.Req.CandidateId, Employee = c, Name = h.Name, Target = h.Req.Address,
                Business = h.Target.Reg != null ? h.Target.Reg.BusinessName : null, Wage = h.Wage,
                CandidateIndex = game.CandidateEmployeeInstances != null ? game.CandidateEmployeeInstances.IndexOf(c) : -1,
                Info = c.candidateInfo,
                HoursLeft = c.candidateInfo != null ? c.candidateInfo.hoursUntilExpiring : 0,
                // Before Hire() sets it: a job-board or campaign candidate carries their
                // business's address, a headhunter's none.
                AssignedBefore = c.assignedAddress,
                DayHired = c.dayHired,
                NextSickDay = c.nextSickDay,
                WorkedHoursToday = c.workedHoursToday,
                WorkedHoursThisWeek = c.workedHoursThisWeek,
                WorkedDays = c.workedDays,
                Satisfaction = c.satisfaction,
                AssignedWeeklyHours = c.assignedWeeklyHours,
                AssignedWeeklyDays = c.assignedWeeklyDays != null
                    ? new List<BigAmbitions.DayNightCycle.DayOfWeekOrdered>(c.assignedWeeklyDays) : null,
                AssignedWorkStationItems = c.assignedWorkStationItems != null ? new List<string>(c.assignedWorkStationItems) : null,
                LastWorkedDay = ReadLastWorkedDay(c)
            };

            var complaint = c.complaintData;
            if (complaint != null)
            {
                s.HasComplaintData = true;
                s.HoursUntilNextComplaint = complaint.hoursUntilNextComplaint;
                s.ComplaintDeadlineHours = complaint.complaintDeadlineHours;
                s.IsComplaining = complaint.isComplaining;
                s.HasRival = complaint.hasRival;
                s.CurrentComplaint = complaint.currentComplaint;
            }

            // EmployeeHelper.FinishPendingNegotiation: the first negotiation with this
            // candidate ends accepted and completed.
            var negotiations = game.candidateSalaryNegotiations;
            if (negotiations != null) s.Negotiation = negotiations.Find(n => n != null && n.employeeInstance == c);
            if (s.Negotiation != null)
            {
                s.NegotiationCompleted = s.Negotiation.completed;
                s.NegotiationAccepted = s.Negotiation.accepted;
            }
            return s;
        }

        /// <summary>
        /// Main thread, after a call that changed something: each recorded week gets the
        /// print the call left, and a week the call left as it was (and opened nothing
        /// on) is dropped, since putting it back would change nothing. What the moves
        /// took off people is read now, against what they held before.
        /// </summary>
        private static UndoState KeepUndo(UndoState undo)
        {
            var kept = new List<ScheduleWrite.UndoState>();
            for (var i = 0; i < undo.Sites.Count; i++)
            {
                var site = undo.Sites[i];
                var reg = WriteService.FindRegistration(site.Address);
                if (reg == null) continue;
                site.PrintAfter = ScheduleWrite.LivePrint(reg);
                if (site.PrintAfter != undo.PrintsBefore[i] || site.OpenedHours) kept.Add(site);
            }
            undo.Sites = kept;
            undo.PrintsBefore = null;
            undo.GrantedBonus = undo.BonusFree && FirstBonusUsed(SaveGameManager.Current);

            var drivers = Drivers();
            foreach (var m in undo.Moves)
            {
                m.TookVehicle = m.Drove && !drivers.Contains(m.Id);
                m.TookContract = m.HadContract && !HasContract(m.Id);
            }
            return undo;
        }

        /// <summary>Everyone driving a delivery vehicle: VehicleSlot.employeeDriverId over every warehouse.</summary>
        private static HashSet<string> Drivers()
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var game = SaveGameManager.Current;
            if (game == null || game.BuildingRegistrations == null) return ids;
            foreach (var reg in game.BuildingRegistrations)
            {
                var warehouse = reg as Warehouse;
                if (warehouse == null || warehouse.vehicleSlots == null) continue;
                foreach (var slot in warehouse.vehicleSlots)
                    if (slot != null && !string.IsNullOrEmpty(slot.employeeDriverId)) ids.Add(slot.employeeDriverId);
            }
            return ids;
        }

        private const string FirstEmployeeBonus = "ba:happinessmodifier_first_employee";

        /// <summary>Whether the game has used its once-only first-employee bonus (GameInstance.usedHappinessModifiers); happiness switched off counts as used.</summary>
        private static bool FirstBonusUsed(GameInstance game)
        {
            if (game == null) return true;
            if (game.gameVariables != null && game.gameVariables.disableHappiness) return true;
            return game.usedHappinessModifiers != null && game.usedHappinessModifiers.Contains(FirstEmployeeBonus);
        }

        /// <summary>A purchasing agent on an import contract (what EmployeeInstance.UnAssignWork cuts).</summary>
        private static bool HasContract(string employeeId)
        {
            var game = SaveGameManager.Current;
            // The helper runs a query over this list, which throws on null.
            if (game == null || game.importPartnerships == null) return false;
            return Buildings.Office.Headquarters.PurchasingAgentHelper.GetAssignedPlanForPurchasingAgent(employeeId) != null;
        }

        private static object ReadLastWorkedDay(EmployeeInstance e)
        {
            if (LastWorkedDayField == null) return null;
            try
            {
                return LastWorkedDayField.GetValue(e);
            }
            catch (Exception ex)
            {
                LinkMod.LogWarn("could not read lastWorkedDay: " + ex.Message);
                return null;
            }
        }

        /// <summary>One un-hire as the answer names it.</summary>
        private sealed class UndoneHire
        {
            public HireUndo H;
            public string Business;
            /// <summary>What the application has left once back; null: it ran out meanwhile, the person is gone.</summary>
            public int? HoursLeft;
        }

        /// <summary>One reversed move as the answer names it.</summary>
        private sealed class UndoneMove
        {
            public MoveUndo M;
            public string From;
            public string To;
            public int ShiftsCleared;
        }

        /// <summary>
        /// POST /write/undo {"kind": "hire"}: the last applied hire call taken back, all or
        /// nothing, only on the game day it was made. Every check first (docs/game-link-api.md,
        /// "Undoing a hire"); then the moves back, the hires out (quietly, back among the
        /// candidates: never fired), the weeks restored, and the game's calls after a
        /// schedule change once per site.
        /// </summary>
        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            // The hire write's reason: MyEmployees lists the candidates and its
            // selection would go stale.
            var blocked = WriteService.MyEmployeesOpen();
            if (blocked && !dryRun) return WriteService.CannotWrite("myemployees");

            var game = SaveGameManager.Current;
            var rows = new List<Row>();

            // The day's wages and the daily run have happened since.
            if (game.Day != state.Day) rows.Add(new Row { Scope = "day", Error = "changed" });

            var restoredKeys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var site in state.Sites) restoredKeys.Add(Key(site.Address));

            var staff = new Dictionary<string, EmployeeInstance>(StringComparer.Ordinal);
            if (game.EmployeeInstances != null)
                foreach (var e in game.EmployeeInstances)
                    if (e != null && e.id != null && !staff.ContainsKey(e.id)) staff[e.id] = e;
            var candidates = Candidates();
            var drivers = Drivers();

            // Moves: the person as the call left them.
            var moves = new List<UndoneMove>();
            foreach (var m in state.Moves)
            {
                var e = m.Employee;
                var targetReg = WriteService.FindRegistration(m.Target);
                EmployeeInstance live;
                var changed = !staff.TryGetValue(m.Id, out live) || !ReferenceEquals(live, e) || e.IsCandidate
                    || !WriteService.SameAddress(e.assignedAddress, new Address(m.Target.Street, m.Target.Number))
                    || e.IsTraining || e.isTrainingDay
                    // The undo's own unassign would cut a vehicle or a contract given at
                    // the new site, and cannot give back one the move cut.
                    || drivers.Contains(m.Id) || HasContract(m.Id) || m.TookVehicle || m.TookContract
                    // Shifts at a site whose week the undo does not put back: they would
                    // be cleared with nothing to restore them.
                    || (!restoredKeys.Contains(Key(m.Target)) && ShiftsOf(targetReg, m.Id) > 0)
                    // An HR manager's plan they joined since the write.
                    || (e.assignedHrManagerPlanId ?? "") != (m.HrPlan ?? "")
                    || !CanReturnTo(m.Source);
                if (changed)
                {
                    rows.Add(new Row { Scope = "move", Id = m.Id, Error = "changed" });
                    continue;
                }
                var sourceReg = WriteService.FindRegistration(m.Source);
                moves.Add(new UndoneMove
                {
                    M = m, From = targetReg != null ? targetReg.BusinessName : null,
                    To = sourceReg != null ? sourceReg.BusinessName : null,
                    // As the forward move: the game clears none of a driver's shifts.
                    ShiftsCleared = e.HasSkill(DriverSkill) ? 0 : ShiftsOf(targetReg, m.Id)
                });
            }

            // Hires: still employed where the call put them, and nothing since that a
            // quiet un-hire would silently undo.
            var elapsed = Math.Max(0, TimeHelper.CurrentHour - state.Hour);
            var hires = new List<UndoneHire>();
            foreach (var h in state.Hires)
            {
                var e = h.Employee;
                var targetReg = WriteService.FindRegistration(h.Target);
                EmployeeInstance live;
                // No candidateInfo recorded: nothing to put them back into the list with.
                var changed = h.Info == null || !staff.TryGetValue(h.Id, out live) || !ReferenceEquals(live, e)
                    || e.IsCandidate || candidates.ContainsKey(h.Id)
                    || !WriteService.SameAddress(e.assignedAddress, new Address(h.Target.Street, h.Target.Number))
                    || e.IsTraining || e.isTrainingDay
                    || !string.IsNullOrEmpty(e.assignedHrManagerPlanId)
                    || e.isBeingReplaced || e.poached
                    || (e.complaintData != null && e.complaintData.isComplaining)
                    || drivers.Contains(h.Id) || HasContract(h.Id)
                    || Math.Abs(e.hourlyWage - h.Wage) > 0.005
                    || (!restoredKeys.Contains(Key(h.Target)) && ShiftsOf(targetReg, h.Id) > 0)
                    // The call hired the company's first employee: the game's once-only bonus stays.
                    || state.GrantedBonus;
                if (changed)
                {
                    rows.Add(new Row { Scope = "hire", Id = h.Id, Error = "changed" });
                    continue;
                }
                var left = h.HoursLeft - elapsed;
                hires.Add(new UndoneHire
                {
                    H = h, Business = targetReg != null ? targetReg.BusinessName : h.Business,
                    HoursLeft = left > 0 ? left : (int?)null
                });
            }

            // Where the reversal leaves people, for the restored shifts' checks: movers
            // back where they came from, hires nowhere.
            var calls = new ScheduleWrite.Assignments();
            foreach (var m in state.Moves)
            {
                calls.People[m.Id] = m.Employee;
                calls.Where[m.Id] = m.Source;
            }
            foreach (var h in state.Hires)
            {
                calls.People[h.Id] = h.Employee;
                calls.Where[h.Id] = null;
            }

            var restores = new List<ScheduleWrite.Restore>();
            var siteErrors = new List<string>();
            foreach (var site in state.Sites)
            {
                var reg = WriteService.FindRegistration(site.Address);
                var error = ScheduleWrite.UndoSiteError(reg, site, calls);
                // The contract names two: the week is not what the call left, or its screen is open.
                if (error != null && error != "screen_open") error = "changed";
                if (error != null) rows.Add(new Row { Scope = "site", HasAddress = true, Address = site.Address, Error = error });
                restores.Add(ScheduleWrite.PrepareRestore(reg, site));
                siteErrors.Add(error);
            }

            var ok = rows.Count == 0 && !blocked;
            if (ok)
            {
                var targets = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
                foreach (var h in state.Hires)
                {
                    AddOwnership(targets, ModOwnership.Target(h.Target), true, false, false);
                    if (h.AssignedBefore != null && !string.IsNullOrEmpty(h.AssignedBefore.streetName))
                        AddOwnership(targets, ModOwnership.Target(new WireAddress(h.AssignedBefore.streetName, h.AssignedBefore.streetNumber)), true, false, false);
                }
                foreach (var m in state.Moves)
                {
                    AddOwnership(targets, ModOwnership.Target(m.Target), false, true, false);
                    if (m.Source != null && !string.IsNullOrEmpty(m.Source.streetName))
                        AddOwnership(targets, ModOwnership.Target(new WireAddress(m.Source.streetName, m.Source.streetNumber)), false, true, false);
                }
                foreach (var restore in restores)
                    AddOwnership(targets, ScheduleWrite.OwnershipTarget(restore.Reg, restore.State.Address, restore.Restored, false, restore.State), false, false, true);
                var refusal = ModOwnership.Check("hire", "undo", targets.Values);
                if (refusal.HasValue) return refusal.Value;
            }
            if (dryRun) return UndoAnswer(true, ok, blocked, null, hires, moves, restores, siteErrors, rows);
            if (rows.Count > 0) return Refused(rows);

            return ApplyUndo(ws, state, elapsed, hires, moves, restores, siteErrors, rows);
        }

        /// <summary>A mover's old business still takes them back: rented, a business, not the empty type. The bench always does.</summary>
        private static bool CanReturnTo(Address source)
        {
            if (source == null || string.IsNullOrEmpty(source.streetName)) return true;
            var reg = WriteService.FindRegistration(source);
            return reg != null && reg.RentedByPlayer && !string.IsNullOrEmpty(reg.BusinessName)
                && !string.IsNullOrEmpty(reg.businessTypeName) && reg.businessTypeName != EmptyType;
        }

        private static WriteAnswer ApplyUndo(WriteService ws, UndoState state, int elapsed, List<UndoneHire> hires,
            List<UndoneMove> moves, List<ScheduleWrite.Restore> restores, List<string> siteErrors, List<Row> rows)
        {
            var touched = new Dictionary<string, Address>(StringComparer.Ordinal);
            try
            {
                // Weeks first: once they are back no shift names a hire, so a throw
                // further on never leaves shifts pointing at a candidate. A mover's source
                // week names them while they are still at the target for a moment;
                // MoveBack's unassign clears shifts at their assigned business only (the
                // target, restored already), never at the source (build 3682 IL).
                foreach (var r in restores)
                {
                    Touch(touched, r.State.Address);
                    ScheduleWrite.RestoreDays(r.State);
                }
                foreach (var m in moves)
                {
                    Touch(touched, m.M.Target);
                    if (m.M.Source != null) Touch(touched, new WireAddress(m.M.Source.streetName, m.M.Source.streetNumber));
                    MoveBack(m.M);
                }
                // In the order they held in the list, so each lands at its old place.
                var ordered = new List<UndoneHire>(hires);
                ordered.Sort((a, b) => a.H.CandidateIndex.CompareTo(b.H.CandidateIndex));
                foreach (var h in ordered)
                {
                    Touch(touched, h.H.Target);
                    UnHire(h.H, elapsed);
                }
            }
            catch (Exception e)
            {
                LinkMod.LogError("a hire undo failed part way: " + e);
                ws.HireUndo = null;
                AfterUndo(ws, moves, restores, touched);
                ws.Applied("bigcopilotlink_notify_undo_hire", new Dictionary<string, string>());
                return WriteService.CannotWrite("other");
            }

            AfterUndo(ws, moves, restores, touched);
            // An undo is not itself undoable.
            ws.HireUndo = null;
            var stamp = ws.Applied("bigcopilotlink_notify_undo_hire", new Dictionary<string, string>());
            return UndoAnswer(false, true, false, stamp, hires, moves, restores, siteErrors, rows);
        }

        private static void Touch(Dictionary<string, Address> touched, WireAddress address)
        {
            var key = Key(address);
            if (!touched.ContainsKey(key)) touched[key] = new Address(address.Street, address.Number);
        }

        /// <summary>
        /// Everything put back: the game's calls after a schedule change once per restored
        /// site (which skip the people now candidates again), the bench to-do for movers
        /// back on the bench, the fulfilled demand at every address the undo touched, the
        /// MyEmployees badges (HireCandidate's own), the to-do recheck, and the schedule
        /// kind's undo for a site this undo restored.
        /// </summary>
        private static void AfterUndo(WriteService ws, List<UndoneMove> moves, List<ScheduleWrite.Restore> restores,
            Dictionary<string, Address> touched)
        {
            foreach (var r in restores)
            {
                var restore = r;
                if (restore.Reg != null) Guard("the calls after a restored week", () => ScheduleWrite.AfterRestore(restore));
            }

            // AfterShiftChange gives anyone left with no shift the idle to-do; someone
            // back on the bench is unassigned, as they were.
            foreach (var m in moves)
            {
                var e = m.M.Employee;
                if (m.M.Source == null) Guard("the bench to-do", () => e.AddTodoTask(TodoTaskType.EmployeeUnassigned, false));
            }

            foreach (var address in touched.Values)
            {
                var a = address;
                Guard("the fulfilled demand", () => CustomerDemandHelper.ReloadCachedFulfilled(a));
            }

            Guard("the MyEmployees badges", () =>
            {
                var uis = global::UI.UIs.Instance;
                if (uis == null) return;
                if (uis.smartphoneUI != null) uis.smartphoneUI.UpdateBadgeCount(AppName.MyEmployees, false);
                if (uis.fullMenu != null && uis.fullMenu.myEmployees != null) uis.fullMenu.myEmployees.UpdateBadge();
            });
            Guard("the to-do recheck", () =>
            {
                var uis = global::UI.UIs.Instance;
                if (uis != null && uis.tasksUI != null) uis.tasksUI.forceCheckForCompletedTodoTasks = true;
            });

            ForgetScheduleUndo(ws, new HashSet<string>(touched.Keys, StringComparer.Ordinal));
        }

        /// <summary>
        /// A move reversed as the game's own move is made (Move above): the shifts and
        /// work at the site the call moved them to cleared, the fulfilled demand reloaded
        /// at both ends, the to-do for the state they are in, and assignedAddress back to
        /// where they came from (null: the bench). The source's restored week gives them
        /// their shifts there back.
        /// </summary>
        private static void MoveBack(MoveUndo m)
        {
            var employee = m.Employee;
            var target = employee.assignedAddress;
            Guard("unassigning from all shifts", () => Helpers.EmployeeHelper.UnassignEmployeeFromAllWorkshifts(employee));
            if (target != null) Guard("the fulfilled demand at the site left", () => CustomerDemandHelper.ReloadCachedFulfilled(target));
            if (m.Source != null) Guard("the fulfilled demand at the old site", () => CustomerDemandHelper.ReloadCachedFulfilled(m.Source));
            Guard("the to-do", () => employee.AddTodoTask(
                employee.IsAssignedToAnyBusiness() ? TodoTaskType.EmployeeIdle : TodoTaskType.EmployeeUnassigned, true));
            employee.assignedAddress = m.Source;
        }

        /// <summary>
        /// A hire reversed quietly, not fired (EmployeeInstance.RemoveEmployee would take
        /// the person out of the game): out of the employees, their to-dos gone, and every
        /// field HireCandidate or the hourly tick changed put back. Back into
        /// CandidateEmployeeInstances at their old place with their candidateInfo and the
        /// hours their application has left; one that would have run out meanwhile is
        /// removed as the game's hourly expiry removes it (EmployeeHelper.RunHourly).
        /// </summary>
        private static void UnHire(HireUndo h, int elapsed)
        {
            var game = SaveGameManager.Current;
            var e = h.Employee;
            game.EmployeeInstances.Remove(e);
            ClearTodos(h.Id);

            e.assignedAddress = h.AssignedBefore;
            e.dayHired = h.DayHired;
            e.nextSickDay = h.NextSickDay;
            if (h.HasComplaintData && e.complaintData != null)
            {
                e.complaintData.hoursUntilNextComplaint = h.HoursUntilNextComplaint;
                e.complaintData.complaintDeadlineHours = h.ComplaintDeadlineHours;
                e.complaintData.isComplaining = h.IsComplaining;
                e.complaintData.hasRival = h.HasRival;
                e.complaintData.currentComplaint = h.CurrentComplaint;
            }
            e.workedHoursToday = h.WorkedHoursToday;
            e.workedHoursThisWeek = h.WorkedHoursThisWeek;
            e.workedDays = h.WorkedDays;
            e.satisfaction = h.Satisfaction;
            e.assignedWeeklyHours = h.AssignedWeeklyHours;
            e.assignedWeeklyDays = h.AssignedWeeklyDays != null
                ? new List<BigAmbitions.DayNightCycle.DayOfWeekOrdered>(h.AssignedWeeklyDays) : null;
            e.assignedWorkStationItems = h.AssignedWorkStationItems != null ? new List<string>(h.AssignedWorkStationItems) : null;
            if (LastWorkedDayField != null && h.LastWorkedDay != null)
                Guard("lastWorkedDay", () => LastWorkedDayField.SetValue(e, h.LastWorkedDay));

            e.candidateInfo = h.Info;
            var left = h.HoursLeft - elapsed;
            var dictionary = Helpers.EmployeeHelper.EmployeeInstancesDictionary;
            if (left <= 0 || h.Info == null)
            {
                if (dictionary != null) dictionary.Remove(h.Id);
                return;
            }

            h.Info.hoursUntilExpiring = left;
            var list = game.CandidateEmployeeInstances;
            var at = Math.Max(0, Math.Min(h.CandidateIndex, list.Count));
            list.Insert(at, e);
            if (dictionary != null && !dictionary.ContainsKey(h.Id)) dictionary[h.Id] = e;
            if (h.Negotiation != null)
            {
                h.Negotiation.completed = h.NegotiationCompleted;
                h.Negotiation.accepted = h.NegotiationAccepted;
            }
        }

        /// <summary>The person's to-dos, as EmployeeInstance.CompleteAllTasks finds them, taken off the screen and out of the list.</summary>
        private static void ClearTodos(string employeeId)
        {
            var tasks = SaveGameManager.Current.TodoTasks;
            if (tasks == null) return;
            var found = tasks.FindAll(t => t != null && t.employeeId == employeeId);
            if (found.Count == 0) return;
            Guard("the to-dos on screen", () =>
            {
                var uis = global::UI.UIs.Instance;
                if (uis != null && uis.tasksUI != null) uis.tasksUI.InstantlyCompleteListOfTasks(found);
            });
            // InstantlyCompleteListOfTasks removes only the tasks it found on screen.
            tasks.RemoveAll(t => t != null && t.employeeId == employeeId);
        }

    }
}
