using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Entities;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/schedule: one business's seven days of shifts, replaced
    /// (docs/mod-link-scope.md section 5, docs/mod-write-back-scope.md sections 5 and 9).
    /// The rules are the BizMan schedule grid's; the calls after the change are
    /// ScheduleHelper.UpdateEmployeeAfterWorkShiftChange's for every employee who had or
    /// has a shift here, then what the schedule screen does as it closes
    /// (BizManSchedule.OnDisable). ScheduleHelper's own methods are not called: they work
    /// on the business the BizMan screen last opened, not on the one written.
    /// </summary>
    public static class ScheduleWrite
    {
        private const string HeadquartersType = "ba:businesstype_headquarters";
        private const string TheaterType = "ba:businesstype_theater";
        private const string CinemaType = "ba:businesstype_cinema";
        private const string CinemaScreen = "ba:itemname_screencinema";

        /// <summary>ScheduleHelper.ShiftLengthCap.</summary>
        private const int ShiftLengthCap = 12;

        /// <summary>ScheduleHelper.GetOverworkedDays: more than this on one day is a warning.</summary>
        private const int OverworkedHours = 14;

        public sealed class Request
        {
            public WireAddress Address;
            public string Expect;
            public bool OpenAllHours;
            public readonly List<DayReq> Days = new List<DayReq>();
        }

        public sealed class DayReq
        {
            public int D;
            public readonly List<ShiftReq> Shifts = new List<ShiftReq>();
        }

        public sealed class ShiftReq
        {
            public double F;
            public double T;
            public string EmployeeId;
            public string ItemInstanceId;
        }

        /// <summary>A shift as the print sees it: a live one, a planned one or a remembered one.</summary>
        private struct Line
        {
            public int D;
            public int From;
            public int To;
            public string Employee;
            public string Item;
            public int Type;
        }

        /// <summary>The business's days before the last applied write, and the print it left.</summary>
        public sealed class UndoState
        {
            internal WireAddress Address;
            internal readonly List<ScheduleDay> Days = new List<ScheduleDay>();
            internal readonly List<List<WorkShift>> Shifts = new List<List<WorkShift>>();
            internal bool OpenedHours;
            internal readonly List<bool> WasOpen = new List<bool>();
            internal readonly List<List<OpeningHourSlot>> Slots = new List<List<OpeningHourSlot>>();
            internal string PrintAfter;
        }

        private sealed class ShiftCheck
        {
            public int D;
            public int Index;
            public ShiftReq Req;
            public string Error;
            public WorkShiftType Type;
        }

        // ---- HTTP thread -----------------------------------------------------------

        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request
            {
                Address = WriteService.ParseAddress(root, "address", "body"),
                Expect = JsonReader.Str(root, "expect", "body", true),
                OpenAllHours = JsonReader.Bool(root, "openAllHours", "body", false)
            };
            var seen = new HashSet<int>();
            var days = JsonReader.OptArr(root, "days", "body");
            for (var i = 0; i < days.Count; i++)
            {
                var path = "body.days[" + i + "]";
                var obj = JsonReader.Obj(days[i], path);
                var d = JsonReader.Num(obj, "d", path);
                if (!JsonReader.IsWhole(d, 0, 6)) throw new BadRequestException(path + ".d must be 0 to 6");
                var day = new DayReq { D = (int)d };
                if (!seen.Add(day.D)) throw new BadRequestException(path + ".d repeats a day");
                var shifts = JsonReader.OptArr(obj, "shifts", path);
                for (var j = 0; j < shifts.Count; j++)
                {
                    var spath = path + ".shifts[" + j + "]";
                    var sobj = JsonReader.Obj(shifts[j], spath);
                    // Whole hours in range are a rule (bad_hours), not a parse error.
                    day.Shifts.Add(new ShiftReq
                    {
                        F = JsonReader.Num(sobj, "f", spath),
                        T = JsonReader.Num(sobj, "t", spath),
                        EmployeeId = JsonReader.Str(sobj, "employeeId", spath, true),
                        ItemInstanceId = JsonReader.Str(sobj, "itemInstanceId", spath, false)
                    });
                }
                req.Days.Add(day);
            }
            return req;
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var reg = WriteService.FindRegistration(req.Address);
            var siteError = (string)null;
            var liveDays = reg != null && reg.scheduleDays != null ? reg.scheduleDays : new List<ScheduleDay>();
            var before = Lines(liveDays);
            var beforePrint = Print(before);

            if (reg == null) siteError = "not_found";
            else if (!string.Equals(req.Expect, beforePrint, StringComparison.OrdinalIgnoreCase)) siteError = "changed";
            else if (!reg.RentedByPlayer) siteError = "not_rented";
            // Not at a headquarters: AddWorkShift ties its shifts to the day's opening slot
            // on every open day, and a person left without a shift there loses their
            // import contracts (UnAssignWork) and HQ plans (UpdateHQPlans), which no undo
            // can give back. The board plans no headquarters.
            else if (reg.businessTypeName == HeadquartersType) siteError = "headquarters";
            else if (WriteService.ScheduleScreenOpenOn(reg)) siteError = "screen_open";

            var dayByD = new Dictionary<int, ScheduleDay>();
            foreach (var sd in liveDays)
                if (sd != null && !dayByD.ContainsKey(DayIndex(sd))) dayByD[DayIndex(sd)] = sd;
            if (reg != null)
                foreach (var day in req.Days)
                    if (!dayByD.ContainsKey(day.D))
                        return WriteAnswer.BadRequest("the business has no schedule day " + day.D.ToString(CultureInfo.InvariantCulture));

            var checks = reg != null ? CheckShifts(reg, req) : new List<ShiftCheck>();
            var failed = siteError != null || checks.Exists(c => c.Error != null);

            var after = new List<Line>();
            foreach (var c in checks)
            {
                if (c.Error != null) continue;
                after.Add(new Line
                {
                    D = c.D, From = (int)c.Req.F, To = (int)c.Req.T, Employee = c.Req.EmployeeId,
                    Item = c.Req.ItemInstanceId ?? "", Type = (int)c.Type
                });
            }
            var openAfter = new Dictionary<int, bool>();
            foreach (var pair in dayByD) openAfter[pair.Key] = req.OpenAllHours || pair.Value.isOpen;

            if (dryRun || failed)
                return Answer(req.Address, reg, dryRun, failed, false, null, siteError, checks, before, after, openAfter, req.OpenAllHours && !failed);

            // Apply. The before-state is kept as copies: the game's own ClearWorkShifts
            // blanks the employeeId of the shifts it removes, so live objects would not
            // survive as a record.
            var undo = new UndoState { Address = req.Address };
            foreach (var sd in liveDays)
            {
                if (sd == null) continue;
                undo.Days.Add(sd);
                undo.Shifts.Add(CloneShifts(sd.workShifts));
                undo.WasOpen.Add(sd.isOpen);
                undo.Slots.Add(CloneSlots(sd.openingHourSlots));
            }
            // Only hours the write really opens are its to put back: a day that was open
            // 0 to 24 already stays the player's, and undo does not check it.
            undo.OpenedHours = req.OpenAllHours && !WasAllOpen(undo);

            // One entry per weekday (a save should hold exactly seven); a duplicate
            // entry, should one exist, is left as it is rather than given the shifts twice.
            foreach (var pair in dayByD)
            {
                var sd = pair.Value;
                var d = pair.Key;
                if (sd.workShifts == null) sd.workShifts = new List<WorkShift>();
                sd.workShifts.Clear();
                foreach (var c in checks)
                {
                    if (c.D != d) continue;
                    sd.workShifts.Add(new WorkShift
                    {
                        startingHour = (int)c.Req.F,
                        endingHour = (int)c.Req.T,
                        employeeId = c.Req.EmployeeId,
                        itemInstanceId = string.IsNullOrEmpty(c.Req.ItemInstanceId) ? null : c.Req.ItemInstanceId,
                        type = c.Type
                    });
                }
                if (req.OpenAllHours) OpenAllDay(sd);
            }

            undo.PrintAfter = Print(Lines(liveDays));
            // The last write of the kind is what undo restores, even one that changed
            // nothing: same shifts, and no hours opened that were not open already. A
            // no-op is not announced and not marked as a change; it only refreshes.
            var changedAnything = undo.PrintAfter != beforePrint || undo.OpenedHours;
            ws.ScheduleUndo = changedAnything ? undo : null;
            string stamp;
            if (changedAnything)
            {
                AfterShiftChange(reg, Employees(before, after));
                stamp = ws.Applied("bigcopilotlink_notify_schedule", reg.BusinessName);
            }
            else stamp = ws.RefreshAfterWrite();
            return Answer(req.Address, reg, false, false, false, stamp, null, checks, before, after, openAfter, req.OpenAllHours);
        }

        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var reg = WriteService.FindRegistration(state.Address);
            var liveDays = reg != null && reg.scheduleDays != null ? reg.scheduleDays : new List<ScheduleDay>();
            var current = Lines(liveDays);

            string siteError = null;
            if (reg == null || Print(current) != state.PrintAfter || !state.Days.TrueForAll(liveDays.Contains) ||
                (state.OpenedHours && !StillOpenAllDay(state.Days)))
                siteError = "changed";
            else if (!reg.RentedByPlayer) siteError = "not_rented";
            else if (WriteService.ScheduleScreenOpenOn(reg)) siteError = "screen_open";
            else if (!StillValid(reg, state)) siteError = "changed";

            var restored = new List<Line>();
            var openAfter = new Dictionary<int, bool>();
            for (var i = 0; i < state.Days.Count; i++)
            {
                var d = DayIndex(state.Days[i]);
                foreach (var ws0 in state.Shifts[i]) restored.Add(ToLine(d, ws0));
                openAfter[d] = state.OpenedHours ? state.WasOpen[i] : state.Days[i].isOpen;
            }

            var failed = siteError != null;
            var noChecks = new List<ShiftCheck>();
            if (dryRun || failed)
                return Answer(state.Address, reg, dryRun, failed, true, null, siteError, noChecks, current, restored, openAfter, state.OpenedHours);

            for (var i = 0; i < state.Days.Count; i++)
            {
                var sd = state.Days[i];
                if (sd.workShifts == null) sd.workShifts = new List<WorkShift>();
                sd.workShifts.Clear();
                sd.workShifts.AddRange(CloneShifts(state.Shifts[i]));
                if (!state.OpenedHours) continue;
                sd.isOpen = state.WasOpen[i];
                if (sd.openingHourSlots == null) sd.openingHourSlots = new List<OpeningHourSlot>();
                sd.openingHourSlots.Clear();
                sd.openingHourSlots.AddRange(CloneSlots(state.Slots[i]));
            }

            AfterShiftChange(reg, Employees(current, restored));
            ws.ScheduleUndo = null;
            var stamp = ws.Applied("bigcopilotlink_notify_undo_schedule", reg.BusinessName);
            return Answer(state.Address, reg, false, false, true, stamp, null, noChecks, current, restored, openAfter, state.OpenedHours);
        }

        // ---- the grid's rules ------------------------------------------------------

        private static List<ShiftCheck> CheckShifts(BuildingRegistration reg, Request req)
        {
            var site = new Site(reg);
            var checks = new List<ShiftCheck>();

            foreach (var day in req.Days)
            {
                var dayChecks = new List<ShiftCheck>();
                for (var i = 0; i < day.Shifts.Count; i++)
                {
                    var s = day.Shifts[i];
                    var c = new ShiftCheck { D = day.D, Index = i, Req = s, Type = WorkShiftType.Default };
                    dayChecks.Add(c);

                    if (!JsonReader.IsWhole(s.F, 0, 24) || !JsonReader.IsWhole(s.T, 0, 24) || s.F >= s.T || s.T - s.F > ShiftLengthCap)
                    {
                        c.Error = "bad_hours";
                        continue;
                    }

                    WorkShiftType type;
                    c.Error = CheckPost(site, s.EmployeeId, s.ItemInstanceId, out type);
                    c.Type = type;
                }

                // One person, one station, per hour: the later of two overlapping shifts is
                // the one refused, so the page can point at it.
                for (var j = 0; j < dayChecks.Count; j++)
                {
                    var b = dayChecks[j];
                    if (b.Error != null) continue;
                    for (var i = 0; i < j; i++)
                    {
                        var a = dayChecks[i];
                        if (a.Error != null || !(a.Req.F < b.Req.T && b.Req.F < a.Req.T)) continue;
                        if (a.Req.EmployeeId == b.Req.EmployeeId)
                        {
                            b.Error = "overlap_person";
                            break;
                        }
                        if (!string.IsNullOrEmpty(b.Req.ItemInstanceId) && a.Req.ItemInstanceId == b.Req.ItemInstanceId)
                        {
                            b.Error = "overlap_station";
                            break;
                        }
                    }
                }
                checks.AddRange(dayChecks);
            }
            return checks;
        }

        /// <summary>What the per-shift rules need to know about the business, worked out once.</summary>
        private sealed class Site
        {
            public readonly Address Address;
            public readonly bool Theater;
            public readonly Dictionary<string, BigAmbitions.Items.ItemInstance> Stations;

            public Site(BuildingRegistration reg)
            {
                Address = WriteService.GameAddress(reg);
                Theater = reg.businessTypeName == TheaterType;
                Stations = Workstations(reg);
            }
        }

        /// <summary>
        /// The rules one shift must pass apart from its hours and overlaps: the person is
        /// assigned here, the item is a workstation here, the person has a skill for it.
        /// Null when it passes; <paramref name="type"/> is then the shift type the game's
        /// GetWorkShiftType gives the station.
        /// </summary>
        private static string CheckPost(Site site, string employeeId, string itemInstanceId, out WorkShiftType type)
        {
            type = WorkShiftType.Default;
            var employee = string.IsNullOrEmpty(employeeId) ? null : Helpers.EmployeeHelper.GetEmployeeById(employeeId, false);
            if (employee == null || !WriteService.SameAddress(employee.assignedAddress, site.Address)) return "not_assigned";

            // A theater's actors work the stage, not an item: the game keeps a ""
            // station for them (ScheduleHelper.FetchWorkstations).
            if (string.IsNullOrEmpty(itemInstanceId)) return site.Theater ? null : "no_station";

            BigAmbitions.Items.ItemInstance station;
            if (!site.Stations.TryGetValue(itemInstanceId, out station)) return "no_station";
            if (!HasSkillFor(employee, station)) return "no_skill";
            // GetWorkShiftType: cleaning stations get the cleaning type, the rest Default.
            if (global::UI.Smartphone.Apps.BizMan.Schedule.ScheduleHelper.IsCleaningStation(station)) type = WorkShiftType.Cleaning;
            return null;
        }

        /// <summary>
        /// Undo puts back shifts that were valid when they were taken. Someone moved to
        /// another business since, a station sold, a skill that no longer fits: the game
        /// has moved on, and the undo answers changed rather than write what the grid
        /// would refuse.
        /// </summary>
        private static bool StillValid(BuildingRegistration reg, UndoState state)
        {
            var site = new Site(reg);
            foreach (var shifts in state.Shifts)
            foreach (var ws in shifts)
            {
                WorkShiftType type;
                if (CheckPost(site, ws.employeeId, ws.itemInstanceId, out type) != null) return false;
            }
            return true;
        }

        /// <summary>
        /// ScheduleHelper.FetchWorkstations for this business: its assignable items
        /// (BuildingRegistration.GetAssignableItems: assignable, and suitable for a skill
        /// the business type or building type uses), plus a cinema's screens.
        /// </summary>
        private static Dictionary<string, BigAmbitions.Items.ItemInstance> Workstations(BuildingRegistration reg)
        {
            var result = new Dictionary<string, BigAmbitions.Items.ItemInstance>(StringComparer.Ordinal);
            var assignable = new List<BigAmbitions.Items.ItemInstance>();
            reg.GetAssignableItems(assignable);
            foreach (var item in assignable)
                if (item != null && item.id != null) result[item.id] = item;
            if (reg.businessTypeName == CinemaType && reg.itemInstances != null)
                foreach (var item in reg.itemInstances.Values)
                    if (item != null && item.id != null && item.itemName == CinemaScreen) result[item.id] = item;
            return result;
        }

        /// <summary>ScheduleHelper.HasSkillForWorkstation: any of the employee's skills in the item's suitableSkills.</summary>
        private static bool HasSkillFor(EmployeeInstance employee, BigAmbitions.Items.ItemInstance station)
        {
            var item = station.ItemCached;
            if (item == null || item.suitableSkills == null || employee.characterData == null || employee.characterData.skills == null)
                return false;
            foreach (var skill in employee.characterData.skills)
                if (skill != null && Array.IndexOf(item.suitableSkills, skill.name) >= 0) return true;
            return false;
        }

        private static void OpenAllDay(ScheduleDay sd)
        {
            // ScheduleDayButton: the open toggle sets isOpen; the hour toggles only edit
            // the slots. Open 0 to 24 is one slot.
            sd.isOpen = true;
            if (sd.openingHourSlots == null) sd.openingHourSlots = new List<OpeningHourSlot>();
            sd.openingHourSlots.Clear();
            sd.openingHourSlots.Add(new OpeningHourSlot(0, 24));
        }

        private static bool WasAllOpen(UndoState undo)
        {
            for (var i = 0; i < undo.Days.Count; i++)
            {
                var slots = undo.Slots[i];
                if (!undo.WasOpen[i] || slots.Count != 1 || slots[0].startingHour != 0 || slots[0].endingHour != 24) return false;
            }
            return true;
        }

        private static bool StillOpenAllDay(List<ScheduleDay> days)
        {
            foreach (var sd in days)
            {
                if (!sd.isOpen || sd.openingHourSlots == null || sd.openingHourSlots.Count != 1) return false;
                var slot = sd.openingHourSlots[0];
                if (slot == null || slot.startingHour != 0 || slot.endingHour != 24) return false;
            }
            return true;
        }

        // ---- after the change ------------------------------------------------------

        /// <summary>
        /// The game's sequence after a schedule edit, for this business.
        /// Per employee, UpdateEmployeeAfterWorkShiftChange(employee, true) (build 3680
        /// IL): weekly hours and days, assigned workstation items, and for one left with
        /// no shift UnAssignWork and the "employee idle" to-do (TodoTaskType 5, with the
        /// quest event). Security as UpdateEmployeesAfterWorkShiftChange does it, once:
        /// for a business that allows theft, or when a guard's shifts changed. (The
        /// game's UpdateHQPlans step never applies: headquarters are refused.) Then the
        /// to-do recheck, and what BizManSchedule.OnDisable
        /// does when the schedule screen closes: customer entries for today, the theater's
        /// actors, the missing-employee alert, and onBuildingRegistrationChange, which
        /// makes the loaded building's stations pick up their new staff. Each call is
        /// guarded on its own: the shifts are written, and one failing must not keep the
        /// rest from running.
        /// </summary>
        private static void AfterShiftChange(BuildingRegistration reg, HashSet<string> employeeIds)
        {
            var address = WriteService.GameAddress(reg);
            var security = Guard("allowtheft", () =>
            {
                var type = Helpers.BusinessTypeHelper.GetData(reg);
                return type != null && type.HasTag(BigAmbitions.Tags.TagRef.Businesstag.allowtheft);
            });

            foreach (var id in employeeIds)
            {
                var employee = Helpers.EmployeeHelper.GetEmployeeById(id, false);
                if (employee == null) continue;
                Guard("the employee update", () =>
                {
                    // null: the employee's own business's days, which are these for
                    // everyone assigned here.
                    employee.UpdateWeeklyHoursAndDays(null);
                    employee.UpdateAssignedWorkStationItems();
                    if (employee.HasAnySkillWithTag(BigAmbitions.Tags.TagRef.Skilltag.affectssecurity)) security = true;
                    if (!employee.IsAssignedToAnyWorkShift())
                    {
                        employee.UnAssignWork();
                        employee.AddTodoTask(TodoTaskType.EmployeeIdle, true);
                    }
                    return true;
                });
            }

            if (security) Guard("the security level", () => { Helpers.BusinessSecurityHelper.UpdateSecurityLevel(reg); return true; });
            Guard("the to-do recheck", () =>
            {
                var uis = global::UI.UIs.Instance;
                if (uis != null && uis.tasksUI != null) uis.tasksUI.forceCheckForCompletedTodoTasks = true;
                return true;
            });

            Guard("the customer entries", () =>
            {
                global::AI.Customers.CustomerEntries.CustomerEntriesHelper.UpdateCustomerEntriesForPlayerBusiness(reg, TimeHelper.GetDayOfWeek());
                return true;
            });
            Guard("the theater check", () => { Helpers.BusinessHelper.CheckIfTheaterHasNoActors(reg); return true; });
            Guard("the missing-employee alert", () =>
            {
                if (!Helpers.BusinessHelper.IsMissingEmployeeTaskActive(reg)) Helpers.BusinessHelper.ForceRecheckMissingEmployeeAlert(reg);
                return true;
            });
            Guard("the building change event", () =>
            {
                var handler = GlobalEvents.onBuildingRegistrationChange;
                if (handler != null) handler(address);
                return true;
            });
        }

        private static bool Guard(string what, Func<bool> call)
        {
            try
            {
                return call();
            }
            catch (Exception e)
            {
                LinkMod.LogWarn(what + " after a schedule write failed: " + e.Message);
                return false;
            }
        }

        // ---- the shift print -------------------------------------------------------

        private static int DayIndex(ScheduleDay sd)
        {
            return (int)sd.day % 7;
        }

        private static Line ToLine(int d, WorkShift ws)
        {
            return new Line
            {
                D = d, From = ws.startingHour, To = ws.endingHour,
                Employee = ws.employeeId ?? "", Item = ws.itemInstanceId ?? "", Type = (int)ws.type
            };
        }

        private static List<Line> Lines(List<ScheduleDay> days)
        {
            var lines = new List<Line>();
            foreach (var sd in days)
            {
                if (sd == null || sd.workShifts == null) continue;
                var d = DayIndex(sd);
                foreach (var ws in sd.workShifts)
                    if (ws != null) lines.Add(ToLine(d, ws));
            }
            return lines;
        }

        /// <summary>
        /// docs/game-link-api.md "Shift print": one line per shift,
        /// d|from|to|employeeId|itemInstanceId|type, sorted ordinally, joined with \n,
        /// FNV-1a 32-bit over the UTF-8 bytes, eight lowercase hex digits. The page
        /// computes the same from the bytes; the contract pins a test vector.
        /// </summary>
        private static string Print(List<Line> lines)
        {
            var texts = new List<string>(lines.Count);
            foreach (var l in lines)
                texts.Add(l.D.ToString(CultureInfo.InvariantCulture) + "|" +
                          l.From.ToString(CultureInfo.InvariantCulture) + "|" +
                          l.To.ToString(CultureInfo.InvariantCulture) + "|" +
                          (l.Employee ?? "") + "|" + (l.Item ?? "") + "|" +
                          l.Type.ToString(CultureInfo.InvariantCulture));
            texts.Sort(string.CompareOrdinal);
            var hash = 0x811c9dc5u;
            foreach (var b in Encoding.UTF8.GetBytes(string.Join("\n", texts)))
            {
                hash ^= b;
                hash = unchecked(hash * 0x01000193u);
            }
            return hash.ToString("x8", CultureInfo.InvariantCulture);
        }

        private static HashSet<string> Employees(List<Line> a, List<Line> b)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var l in a) if (!string.IsNullOrEmpty(l.Employee)) ids.Add(l.Employee);
            foreach (var l in b) if (!string.IsNullOrEmpty(l.Employee)) ids.Add(l.Employee);
            return ids;
        }

        private static List<WorkShift> CloneShifts(List<WorkShift> shifts)
        {
            var copy = new List<WorkShift>();
            if (shifts != null)
                foreach (var ws in shifts)
                    if (ws != null) copy.Add(ws.Clone());
            return copy;
        }

        private static List<OpeningHourSlot> CloneSlots(List<OpeningHourSlot> slots)
        {
            var copy = new List<OpeningHourSlot>();
            if (slots != null)
                foreach (var s in slots)
                    if (s != null) copy.Add(s.Clone());
            return copy;
        }

        // ---- the answer ------------------------------------------------------------

        private static WriteAnswer Answer(WireAddress address, BuildingRegistration reg, bool dryRun, bool failed, bool undo,
            string stamp, string siteError, List<ShiftCheck> checks, List<Line> before, List<Line> after,
            Dictionary<int, bool> openAfter, bool openedHours)
        {
            var w = new JsonWriter();
            w.BeginObject();
            var status = 200;
            if (failed && !dryRun)
            {
                status = 409;
                w.Prop("error", siteError == "changed" ? "changed" : "refused");
            }
            // The business's own refusal. In a 409 refused it also leads the rows, as a
            // row with no d and i.
            w.Prop("siteError", siteError);
            w.Prop("ok", !failed);
            w.Prop("kind", "schedule");
            w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);
            WriteService.WriteAddress(w, "address", address.Street, address.Number);
            w.Prop("business", reg != null ? reg.BusinessName : null);

            w.BeginObject("before");
            w.Prop("shifts", before.Count);
            w.Prop("print", Print(before));
            w.EndObject();
            w.BeginObject("after");
            w.Prop("shifts", after.Count);
            w.Prop("print", Print(after));
            w.EndObject();
            w.Prop("removed", before.Count);
            w.Prop("added", after.Count);
            w.Prop("openedHours", openedHours);

            var afterIds = Employees(after, new List<Line>());
            var left = new List<string>();
            foreach (var l in before)
                if (!string.IsNullOrEmpty(l.Employee) && !afterIds.Contains(l.Employee) && !left.Contains(l.Employee)) left.Add(l.Employee);
            w.BeginArray("leftWithout");
            foreach (var id in left)
            {
                w.BeginObject();
                w.Prop("employeeId", id);
                w.Prop("name", NameOf(id));
                w.EndObject();
            }
            w.EndArray();

            // GetOverworkedDays: more than 14 hours on one day, counted only on an open day
            // (EmployeeInstance.GetWorkingHoursOnDay).
            var hours = new Dictionary<string, int>(StringComparer.Ordinal);
            var order = new List<string>();
            foreach (var l in after)
            {
                bool open;
                if (string.IsNullOrEmpty(l.Employee) || !openAfter.TryGetValue(l.D, out open) || !open) continue;
                var key = l.Employee + "|" + l.D.ToString(CultureInfo.InvariantCulture);
                int sum;
                if (!hours.TryGetValue(key, out sum)) order.Add(key);
                hours[key] = sum + (l.To - l.From);
            }
            w.BeginArray("warnings");
            foreach (var key in order)
            {
                if (hours[key] <= OverworkedHours) continue;
                var bar = key.LastIndexOf('|');
                var id = key.Substring(0, bar);
                w.BeginObject();
                w.Prop("type", "overworked");
                w.Prop("employeeId", id);
                w.Prop("name", NameOf(id));
                w.Prop("d", int.Parse(key.Substring(bar + 1), CultureInfo.InvariantCulture));
                w.Prop("hours", hours[key]);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("rows");
            var refused = status == 409;
            if (refused && siteError != null && siteError != "changed")
            {
                w.BeginObject();
                w.Prop("error", siteError);
                w.EndObject();
            }
            // A changed business is re-planned whole, so its shift errors mean nothing.
            foreach (var c in checks)
            {
                if (c.Error == null || (refused && siteError == "changed")) continue;
                w.BeginObject();
                w.Prop("d", c.D);
                w.Prop("i", c.Index);
                w.Prop("error", c.Error);
                w.EndObject();
            }
            w.EndArray();
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }

        private static string NameOf(string employeeId)
        {
            var e = Helpers.EmployeeHelper.GetEmployeeById(employeeId, false);
            return e != null && e.characterData != null ? e.characterData.name : null;
        }
    }
}
