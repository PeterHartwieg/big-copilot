using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using Entities;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/hire (from 0.3.0): hires headhunter candidates into sites, moves
    /// employees between sites, and writes the weeks of the sites involved, in one call
    /// (docs/game-link-api.md, POST /write/hire). The moves are the
    /// game's MyEmployees "Assign business" mass action (AssignBusinessMassAction's
    /// closure, build 3682 IL), the hires its "Assign business and hire"
    /// (AssignToBusinessAndHireMassAction.HireAndAssignBusiness's closure), calling the
    /// same game helpers rather than copying their bodies; the weeks are ScheduleWrite's
    /// checks and apply, judged as if the call's moves and hires had happened. From 0.4.0 a
    /// call may also write the weeks of sites no hire or move reaches (hire.reschedule), and
    /// an applied call can be undone the same game day (hire.undo, Undo below). A candidate
    /// who has left the game's list is skipped, never refused.
    /// </summary>
    public static class HireWrite
    {
        private const string HeadquartersType = "ba:businesstype_headquarters";
        private const string EmptyType = "ba:businesstype_empty";
        private const string CleaningSkill = "ba:skill_cleaning";
        private const string SecuritySkill = "ba:skill_securityguard";
        private const string DriverSkill = "ba:skill_deliverydriver";

        public sealed class Request
        {
            public readonly List<SiteReq> Sites = new List<SiteReq>();
            public readonly List<HireReq> Hires = new List<HireReq>();
            public readonly List<MoveReq> Moves = new List<MoveReq>();
        }

        public sealed class SiteReq
        {
            public WireAddress Address;
            /// <summary>The week to write; null for "assign only, the week as it is".</summary>
            public ScheduleWrite.Request Week;
        }

        public sealed class HireReq
        {
            public string CandidateId;
            public WireAddress Address;
            public double Wage;
        }

        public sealed class MoveReq
        {
            public string EmployeeId;
            /// <summary>False: the bytes had them on no business.</summary>
            public bool HasFrom;
            public WireAddress From;
            public WireAddress To;
        }

        /// <summary>One sites[] entry as the main thread found it.</summary>
        private sealed class SiteState
        {
            public SiteReq Req;
            public BuildingRegistration Reg;
            public string Error;
            /// <summary>The skills the site takes a person for; null where the game's assign filter would not offer it (anyone passes here: the site's own error refuses the call).</summary>
            public HashSet<string> Accepts;
            public ScheduleWrite.Week Week;
        }

        private sealed class Moved
        {
            public MoveReq Req;
            public EmployeeInstance Employee;
            public SiteState Target;
            public BuildingRegistration Source;
            public string Name;
            public int ShiftsCleared;
        }

        private sealed class Hired
        {
            public HireReq Req;
            public EmployeeInstance Candidate;
            public SiteState Target;
            public string Name;
            public float Wage;
            public int? HoursLeft;
        }

        private sealed class Skipped
        {
            public string CandidateId;
            public string Name;
            public int HoursDropped;
        }

        private sealed class Row
        {
            public string Scope;
            public string Id;
            public bool HasAddress;
            public WireAddress Address;
            public bool HasShift;
            public int D;
            public int I;
            public string Error;
        }

        // ---- HTTP thread -----------------------------------------------------------

        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request();
            var sites = JsonReader.Arr(JsonReader.Get(root, "sites"), "body.sites");
            var hires = JsonReader.Arr(JsonReader.Get(root, "hires"), "body.hires");
            var moves = JsonReader.Arr(JsonReader.Get(root, "moves"), "body.moves");

            var siteKeys = new HashSet<string>(StringComparer.Ordinal);
            var assignOnly = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < sites.Count; i++)
            {
                var path = "body.sites[" + i + "]";
                var obj = JsonReader.Obj(sites[i], path);
                var site = new SiteReq { Address = WriteService.ParseAddress(obj, "address", path) };
                if (!siteKeys.Add(Key(site.Address))) throw new BadRequestException(path + " names a site twice");
                var openAllHours = JsonReader.Bool(obj, "openAllHours", path, false);
                if (JsonReader.Get(obj, "days") == null)
                {
                    if (JsonReader.Get(obj, "expect") != null)
                        throw new BadRequestException(path + ".expect must be null when days is null");
                    assignOnly.Add(Key(site.Address));
                }
                else
                {
                    site.Week = new ScheduleWrite.Request
                    {
                        Address = site.Address,
                        Expect = JsonReader.Str(obj, "expect", path, true),
                        OpenAllHours = openAllHours
                    };
                    ScheduleWrite.ParseDays(obj, path, site.Week);
                }
                req.Sites.Add(site);
            }

            // One person, one row, across hires and moves.
            var people = new HashSet<string>(StringComparer.Ordinal);
            var targets = new HashSet<string>(StringComparer.Ordinal);
            var sources = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < hires.Count; i++)
            {
                var path = "body.hires[" + i + "]";
                var obj = JsonReader.Obj(hires[i], path);
                var hire = new HireReq
                {
                    CandidateId = JsonReader.Str(obj, "candidateId", path, true),
                    Address = WriteService.ParseAddress(obj, "address", path)
                };
                var expect = JsonReader.Obj(JsonReader.Get(obj, "expect"), path + ".expect");
                hire.Wage = JsonReader.Num(expect, "wage", path + ".expect");
                // Informational: the mod answers the live hours left.
                var seen = JsonReader.Get(obj, "seenHoursLeft");
                if (seen != null && !(seen is double)) throw new BadRequestException(path + ".seenHoursLeft must be a number or null");
                if (!people.Add(hire.CandidateId)) throw new BadRequestException(path + " names someone twice");
                targets.Add(Key(hire.Address));
                req.Hires.Add(hire);
            }
            for (var i = 0; i < moves.Count; i++)
            {
                var path = "body.moves[" + i + "]";
                var obj = JsonReader.Obj(moves[i], path);
                var move = new MoveReq
                {
                    EmployeeId = JsonReader.Str(obj, "employeeId", path, true),
                    HasFrom = JsonReader.Get(obj, "from") != null,
                    To = WriteService.ParseAddress(obj, "to", path)
                };
                if (move.HasFrom)
                {
                    move.From = WriteService.ParseAddress(obj, "from", path);
                    if (Key(move.From) == Key(move.To)) throw new BadRequestException(path + " moves someone to where they are");
                    sources.Add(Key(move.From));
                }
                if (!people.Add(move.EmployeeId)) throw new BadRequestException(path + " names someone twice");
                targets.Add(Key(move.To));
                req.Moves.Add(move);
            }

            foreach (var target in targets)
                if (!siteKeys.Contains(target)) throw new BadRequestException("every hire's and move's target needs its body.sites entry");
            // From 0.4.0 (hire.reschedule) a site no hire or move touches is written for its
            // week alone; with days null it would do nothing.
            foreach (var site in assignOnly)
                if (!targets.Contains(site) && !sources.Contains(site))
                    throw new BadRequestException("body.sites names a site no hire or move touches, with days null");
            return req;
        }

        private static string Key(WireAddress address)
        {
            return address.Street + "\n" + address.Number.ToString(CultureInfo.InvariantCulture);
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            // The phone's MyEmployees app lists the candidates and holds a mass-action
            // selection built when it opened; both would go stale under the change. A dry
            // run still answers, with blocked, so the page can say so before the confirm.
            var blocked = WriteService.MyEmployeesOpen();
            if (blocked && !dryRun) return WriteService.CannotWrite("myemployees");

            var rows = new List<Row>();

            // Sites first: the moves and hires check skills against their targets.
            var sites = new List<SiteState>();
            var byKey = new Dictionary<string, SiteState>(StringComparer.Ordinal);
            foreach (var site in req.Sites)
            {
                var state = CheckSite(site);
                if (state.Reg != null && site.Week != null)
                {
                    var missing = ScheduleWrite.MissingDay(state.Reg, site.Week);
                    if (missing >= 0)
                        return WriteAnswer.BadRequest("the business at " + site.Address.Street + " " +
                            site.Address.Number.ToString(CultureInfo.InvariantCulture) + " has no schedule day " +
                            missing.ToString(CultureInfo.InvariantCulture));
                }
                sites.Add(state);
                byKey[Key(site.Address)] = state;
            }

            // Moves: not_found, changed (not at from any more), in_training, no_skill.
            var moved = new List<Moved>();
            foreach (var move in req.Moves)
            {
                var target = byKey[Key(move.To)];
                var employee = Helpers.EmployeeHelper.GetEmployeeById(move.EmployeeId, false);
                // The employee dictionary holds the candidates too; a candidate is nobody's staff yet.
                if (employee != null && employee.IsCandidate) employee = null;

                string error = null;
                if (employee == null) error = "not_found";
                else if (!WriteService.SameAddress(employee.assignedAddress, move.HasFrom ? new Address(move.From.Street, move.From.Number) : null)) error = "changed";
                // The game's move turns a person in training away
                // (myemployees_mass_action_cant_assign_business_to_training_employee).
                else if (employee.IsTraining) error = "in_training";
                else if (!Takes(target, employee)) error = "no_skill";
                if (error != null)
                {
                    rows.Add(new Row { Scope = "move", Id = move.EmployeeId, Error = error });
                    continue;
                }

                var source = move.HasFrom ? WriteService.FindRegistration(move.From) : null;
                moved.Add(new Moved
                {
                    Req = move, Employee = employee, Target = target, Source = source,
                    // The game's move (UnassignEmployeeFromAllWorkshifts) clears no shift of
                    // someone who can drive a delivery vehicle (build 3682 IL: HasSkill first):
                    // theirs stay where they were, so none is counted as cleared.
                    Name = NameOf(employee), ShiftsCleared = employee.HasSkill(DriverSkill) ? 0 : ShiftsOf(source, move.EmployeeId)
                });
            }

            // Hires: gone (skipped, never a refusal), changed (the wage), no_skill.
            var candidates = Candidates();
            var hired = new List<Hired>();
            var skipped = new List<Skipped>();
            var gone = new HashSet<string>(StringComparer.Ordinal);
            foreach (var hire in req.Hires)
            {
                EmployeeInstance candidate;
                if (!candidates.TryGetValue(hire.CandidateId, out candidate))
                {
                    // Expired, hired or discarded in the phone since the bytes, or never a
                    // candidate: the mod cannot tell these apart.
                    gone.Add(hire.CandidateId);
                    var known = Helpers.EmployeeHelper.GetEmployeeById(hire.CandidateId, false);
                    skipped.Add(new Skipped { CandidateId = hire.CandidateId, Name = known != null ? NameOf(known) : null });
                    continue;
                }

                var target = byKey[Key(hire.Address)];
                string error = null;
                // Equal to the cent, or the page re-plans.
                if (Math.Abs(candidate.hourlyWage - hire.Wage) > 0.005) error = "changed";
                else if (!Takes(target, candidate)) error = "no_skill";
                if (error != null)
                {
                    rows.Add(new Row { Scope = "hire", Id = hire.CandidateId, Error = error });
                    continue;
                }

                hired.Add(new Hired
                {
                    Req = hire, Candidate = candidate, Target = target, Name = NameOf(candidate),
                    Wage = candidate.hourlyWage,
                    HoursLeft = candidate.candidateInfo != null ? candidate.candidateInfo.hoursUntilExpiring : (int?)null
                });
            }

            // Where everyone would work once the moves and hires are done.
            var calls = new ScheduleWrite.Assignments();
            foreach (var m in moved)
            {
                calls.People[m.Req.EmployeeId] = m.Employee;
                calls.Where[m.Req.EmployeeId] = new Address(m.Req.To.Street, m.Req.To.Number);
            }
            foreach (var h in hired)
            {
                calls.People[h.Req.CandidateId] = h.Candidate;
                calls.Where[h.Req.CandidateId] = new Address(h.Req.Address.Street, h.Req.Address.Number);
            }
            calls.Dropped.UnionWith(gone);
            var away = new HashSet<string>(calls.Where.Keys, StringComparer.Ordinal);

            // Each site: its own error, or its shifts judged as if the call had happened.
            foreach (var site in sites)
            {
                if (site.Error != null)
                {
                    rows.Add(new Row { Scope = "site", HasAddress = true, Address = site.Req.Address, Error = site.Error });
                    continue;
                }
                if (site.Req.Week == null) continue; // assign only: the week stays as it is

                foreach (var day in site.Req.Week.Days)
                foreach (var shift in day.Shifts)
                {
                    if (shift.EmployeeId == null || !gone.Contains(shift.EmployeeId)) continue;
                    var hours = JsonReader.IsWhole(shift.F, 0, 24) && JsonReader.IsWhole(shift.T, 0, 24) && shift.T > shift.F
                        ? (int)(shift.T - shift.F) : 0;
                    var skip = skipped.Find(s => s.CandidateId == shift.EmployeeId);
                    if (skip != null) skip.HoursDropped += hours;
                }

                site.Week = ScheduleWrite.CheckWeek(site.Reg, site.Req.Week, calls);
                foreach (var c in site.Week.Checks)
                {
                    if (c.Error == null) continue;
                    rows.Add(new Row
                    {
                        Scope = "shift", HasAddress = true, Address = site.Req.Address, HasShift = true,
                        D = c.D, I = c.Index, Error = c.Error
                    });
                }
            }

            var ok = rows.Count == 0 && !blocked;
            if (dryRun) return Answer(true, ok, blocked, null, hired, moved, skipped, sites, away, rows);
            if (rows.Count > 0) return Refused(rows);

            return Apply(ws, hired, moved, skipped, sites, away, rows);
        }

        /// <summary>
        /// A site's own rules, in the contract's order: not_found, changed (sites with
        /// days), not_rented, no_business, headquarters (days at a headquarters),
        /// screen_open. Also the skills it takes a person for.
        /// </summary>
        private static SiteState CheckSite(SiteReq site)
        {
            var state = new SiteState { Req = site, Reg = WriteService.FindRegistration(site.Address) };
            var reg = state.Reg;
            if (reg == null)
            {
                state.Error = "not_found";
                return state;
            }

            // AssignToBusinessAndHireMassAction.PlayerBuildingFilter: rented by the
            // player, a business name, a business type other than empty.
            var offered = reg.RentedByPlayer && !string.IsNullOrEmpty(reg.BusinessName)
                && !string.IsNullOrEmpty(reg.businessTypeName) && reg.businessTypeName != EmptyType;
            if (offered) state.Accepts = Accepts(reg);

            if (site.Week != null && !string.Equals(site.Week.Expect, ScheduleWrite.LivePrint(reg), StringComparison.OrdinalIgnoreCase))
                state.Error = "changed";
            else if (!reg.RentedByPlayer) state.Error = "not_rented";
            else if (!offered) state.Error = "no_business";
            // ScheduleWrite's reason: a headquarters' shifts are tied to its opening slot,
            // and a person left without one there loses contracts and plans.
            else if (site.Week != null && reg.businessTypeName == HeadquartersType) state.Error = "headquarters";
            // Assign-only sites too: the open screen caches who works here.
            else if (WriteService.ScheduleScreenOpenOn(reg)) state.Error = "screen_open";
            return state;
        }

        /// <summary>
        /// The skills a business takes a person for, as the game's assign check builds
        /// them (the closures of AssignBusinessMassAction and HireAndAssignBusiness, build
        /// 3682 IL): the business type's employeePrimarySkills, cleaning where the
        /// building type NeedsCleaning, security guard where the business type has the
        /// allowtheft tag, delivery driver where the building type's requiredBuildingSkills
        /// names it.
        /// </summary>
        private static HashSet<string> Accepts(BuildingRegistration reg)
        {
            var skills = new HashSet<string>(StringComparer.Ordinal);
            var business = Helpers.BusinessTypeHelper.GetData(reg);
            var building = Buildings.BuildingTypeHelper.GetData(reg);
            if (business != null && business.employeePrimarySkills != null)
                foreach (var s in business.employeePrimarySkills)
                    if (!string.IsNullOrEmpty(s)) skills.Add(s);
            if (building != null && building.NeedsCleaning) skills.Add(CleaningSkill);
            if (business != null && business.HasTag(BigAmbitions.Tags.TagRef.Businesstag.allowtheft)) skills.Add(SecuritySkill);
            if (building != null && building.requiredBuildingSkills != null && Array.IndexOf(building.requiredBuildingSkills, DriverSkill) >= 0)
                skills.Add(DriverSkill);
            return skills;
        }

        /// <summary>The game's check: any of the person's skills (characterData.skills) in what the site takes.</summary>
        private static bool Takes(SiteState site, EmployeeInstance person)
        {
            if (site.Accepts == null) return true;
            if (person.characterData == null || person.characterData.skills == null) return false;
            foreach (var skill in person.characterData.skills)
                if (skill != null && skill.name != null && site.Accepts.Contains(skill.name)) return true;
            return false;
        }

        /// <summary>GameInstance.CandidateEmployeeInstances by id: the game's list now.</summary>
        private static Dictionary<string, EmployeeInstance> Candidates()
        {
            var byId = new Dictionary<string, EmployeeInstance>(StringComparer.Ordinal);
            var instance = SaveGameManager.Current;
            var list = instance != null ? instance.CandidateEmployeeInstances : null;
            if (list == null) return byId;
            foreach (var c in list)
                if (c != null && c.id != null && !byId.ContainsKey(c.id)) byId[c.id] = c;
            return byId;
        }

        /// <summary>How many shifts at <paramref name="reg"/> name the person: what a move takes off them there.</summary>
        private static int ShiftsOf(BuildingRegistration reg, string employeeId)
        {
            var n = 0;
            if (reg == null || reg.scheduleDays == null) return 0;
            foreach (var sd in reg.scheduleDays)
            {
                if (sd == null || sd.workShifts == null) continue;
                foreach (var shift in sd.workShifts)
                    if (shift != null && shift.employeeId == employeeId) n++;
            }
            return n;
        }

        private static string NameOf(EmployeeInstance person)
        {
            return person != null && person.characterData != null ? person.characterData.name : null;
        }

        // ---- the apply -------------------------------------------------------------

        /// <summary>
        /// Every check passed: moves, then hires, then each week, in the game's order, on
        /// this one main-thread call. Each game call that follows a change is guarded on
        /// its own, as ScheduleWrite does; should the change itself throw part way, what
        /// was done is still marked, announced and refreshed, and the page hears "other".
        /// </summary>
        private static WriteAnswer Apply(WriteService ws, List<Hired> hired, List<Moved> moved, List<Skipped> skipped,
            List<SiteState> sites, HashSet<string> away, List<Row> rows)
        {
            var written = new HashSet<string>(StringComparer.Ordinal);
            string weekBusiness = null;
            var weeks = 0;
            // What the undo needs, taken before anything changes. Should the record fail,
            // the call still runs, without an undo, and its answer says so (undoable false).
            UndoState undo = null;
            try
            {
                undo = RecordUndo(hired, moved, sites);
            }
            catch (Exception e)
            {
                LinkMod.LogError("could not record a hire write's undo: " + e);
            }
            try
            {
                foreach (var m in moved)
                {
                    Move(m);
                    if (m.Source != null && m.ShiftsCleared > 0) written.Add(Key(m.Req.From));
                }
                foreach (var h in hired) Hire(h);
                foreach (var site in sites)
                {
                    if (site.Week == null) continue;
                    // Every site whose week the call sends counts as written, whether or
                    // not its shifts come out different.
                    written.Add(Key(site.Req.Address));
                    if (!ScheduleWrite.ApplyWeek(site.Week)) continue;
                    weeks++;
                    if (weekBusiness == null) weekBusiness = site.Reg.BusinessName;
                }
            }
            catch (Exception e)
            {
                LinkMod.LogError("a hire write failed part way: " + e);
                ForgetScheduleUndo(ws, written);
                // Half a call is no state an undo can promise to restore.
                ws.HireUndo = null;
                Finish(ws, hired.Count, moved.Count, weeks, weekBusiness);
                return WriteService.CannotWrite("other");
            }

            ForgetScheduleUndo(ws, written);
            // An apply that changed nothing replaces the kind's undo with nothing.
            ws.HireUndo = null;
            if (undo != null && hired.Count + moved.Count + weeks > 0)
            {
                try
                {
                    ws.HireUndo = KeepUndo(undo);
                }
                catch (Exception e)
                {
                    LinkMod.LogError("could not keep a hire write's undo: " + e);
                }
            }
            var stamp = Finish(ws, hired.Count, moved.Count, weeks, weekBusiness);
            // Whether this call can be undone: false where the record failed, so the page
            // never offers an Undo the mod cannot keep.
            // A call that granted the once-only first-employee bonus keeps its record,
            // and its undo refuses (the bonus stays): never offered as undoable.
            return Answer(false, true, false, stamp, hired, moved, skipped, sites, away, rows,
                ws.HireUndo != null && !ws.HireUndo.GrantedBonus);
        }

        /// <summary>
        /// AssignBusinessMassAction's closure for one employee, in its order: the shifts
        /// and a driver's vehicle slot cleared (UnassignEmployeeFromAllWorkshifts, which
        /// also clears assignedAddress, reloads the old business's fulfilled demand and
        /// adds the idle to-do), the fulfilled demand reloaded at the new and the old
        /// business, the to-do for the state the person is now in (unassigned: 13), and
        /// assignedAddress set to the new business.
        /// </summary>
        private static void Move(Moved m)
        {
            var employee = m.Employee;
            var oldAddress = employee.assignedAddress;
            var newAddress = m.Target.Reg.Address;
            Guard("unassigning from all shifts", () => Helpers.EmployeeHelper.UnassignEmployeeFromAllWorkshifts(employee));
            Guard("the fulfilled demand at the new business", () => CustomerDemandHelper.ReloadCachedFulfilled(newAddress));
            if (oldAddress != null)
                Guard("the fulfilled demand at the old business", () => CustomerDemandHelper.ReloadCachedFulfilled(oldAddress));
            Guard("the to-do", () => employee.AddTodoTask(
                employee.IsAssignedToAnyBusiness() ? TodoTaskType.EmployeeIdle : TodoTaskType.EmployeeUnassigned, true));
            employee.assignedAddress = newAddress;
        }

        /// <summary>
        /// HireAndAssignBusiness's closure for one candidate: assignedAddress set to the
        /// business, then EmployeeHelper.HireCandidate, which keeps the same instance and
        /// id, moves it from CandidateEmployeeInstances to the employees, finishes a
        /// pending salary negotiation as accepted, clears candidateInfo, sets dayHired and
        /// adds the to-do. The game then removes the candidate from the MyEmployees
        /// scroller; that app is closed (the write refuses while it is open) and reloads
        /// its lists when it opens.
        /// </summary>
        private static void Hire(Hired h)
        {
            h.Candidate.assignedAddress = h.Target.Reg.Address;
            Helpers.EmployeeHelper.HireCandidate(h.Candidate);
        }

        /// <summary>The schedule kind's undo belongs to a site this call wrote (or undid): it would restore over the call.</summary>
        private static void ForgetScheduleUndo(WriteService ws, HashSet<string> written)
        {
            var undo = ws.ScheduleUndo;
            if (undo != null && written.Contains(Key(undo.Address))) ws.ScheduleUndo = null;
        }

        /// <summary>
        /// MarkChange, one notification and the refresh, when anything changed; the
        /// refresh alone when nothing did (every hire gone, every week as it stood). The
        /// stamp before the refresh.
        /// </summary>
        private static string Finish(WriteService ws, int hires, int moves, int weeks, string weekBusiness)
        {
            string key;
            var data = new Dictionary<string, string>();
            if (hires > 0 && moves > 0) key = "bigcopilotlink_notify_hire_move";
            else if (hires > 0) key = "bigcopilotlink_notify_hire";
            else if (moves > 0) key = "bigcopilotlink_notify_move";
            else if (weeks > 0) key = "bigcopilotlink_notify_schedule";
            else return ws.RefreshAfterWrite();

            data["hired"] = hires.ToString(CultureInfo.InvariantCulture);
            data["moved"] = moves.ToString(CultureInfo.InvariantCulture);
            data["business"] = weekBusiness ?? "";
            return ws.Applied(key, data);
        }

        private static void Guard(string what, Action call)
        {
            try
            {
                call();
            }
            catch (Exception e)
            {
                LinkMod.LogWarn(what + " in a hire write failed: " + e.Message);
            }
        }

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

        private static WriteAnswer UndoAnswer(bool dryRun, bool ok, bool blocked, string stamp, List<UndoneHire> hires,
            List<UndoneMove> moves, List<ScheduleWrite.Restore> restores, List<string> siteErrors, List<Row> rows)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("ok", ok);
            w.Prop("kind", "hire");
            w.Prop("dryRun", dryRun);
            w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);
            if (blocked) w.Prop("blocked", "myemployees");

            var wageAdded = 0.0;
            w.BeginArray("hired");
            foreach (var h in hires)
            {
                w.BeginObject();
                w.Prop("candidateId", h.H.Id);
                w.Prop("name", h.H.Name);
                w.Prop("business", h.Business);
                w.Prop("wage", Math.Round((double)h.H.Wage, 2));
                if (h.HoursLeft.HasValue) w.Prop("hoursLeft", h.HoursLeft.Value);
                else w.PropNull("hoursLeft");
                w.EndObject();
                wageAdded -= Math.Round((double)h.H.Wage, 2);
            }
            w.EndArray();

            w.BeginArray("moved");
            foreach (var m in moves)
            {
                w.BeginObject();
                w.Prop("employeeId", m.M.Id);
                w.Prop("name", m.M.Name);
                w.Prop("from", m.From);
                w.Prop("to", m.To);
                w.Prop("shiftsCleared", m.ShiftsCleared);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("skipped");
            w.EndArray();

            w.BeginArray("sites");
            for (var i = 0; i < restores.Count; i++)
            {
                var r = restores[i];
                w.BeginObject();
                WriteService.WriteAddress(w, "address", r.State.Address.Street, r.State.Address.Number);
                w.Prop("business", r.Reg != null ? r.Reg.BusinessName : null);
                ScheduleWrite.WriteRestore(w, r);
                w.Prop("siteError", siteErrors[i]);
                w.EndObject();
            }
            w.EndArray();

            w.Prop("wageAdded", Math.Round(wageAdded, 2));
            WriteRows(w, rows);
            w.EndObject();
            return new WriteAnswer(200, w.ToString());
        }


        // ---- the answer ------------------------------------------------------------

        private static WriteAnswer Answer(bool dryRun, bool ok, bool blocked, string stamp, List<Hired> hired, List<Moved> moved,
            List<Skipped> skipped, List<SiteState> sites, HashSet<string> away, List<Row> rows)
        {
            return Answer(dryRun, ok, blocked, stamp, hired, moved, skipped, sites, away, rows, null);
        }

        /// <summary>The answer; <paramref name="undoable"/>, on an apply, whether the call can be undone.</summary>
        private static WriteAnswer Answer(bool dryRun, bool ok, bool blocked, string stamp, List<Hired> hired, List<Moved> moved,
            List<Skipped> skipped, List<SiteState> sites, HashSet<string> away, List<Row> rows, bool? undoable)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("ok", ok);
            w.Prop("kind", "hire");
            w.Prop("dryRun", dryRun);
            if (stamp != null) w.Prop("stamp", stamp);
            if (undoable.HasValue) w.Prop("undoable", undoable.Value);
            if (blocked) w.Prop("blocked", "myemployees");

            var wageAdded = 0.0;
            w.BeginArray("hired");
            foreach (var h in hired)
            {
                w.BeginObject();
                w.Prop("candidateId", h.Req.CandidateId);
                w.Prop("name", h.Name);
                w.Prop("business", h.Target.Reg != null ? h.Target.Reg.BusinessName : null);
                w.Prop("wage", Math.Round((double)h.Wage, 2));
                if (h.HoursLeft.HasValue) w.Prop("hoursLeft", h.HoursLeft.Value);
                else w.PropNull("hoursLeft");
                w.EndObject();
                wageAdded += Math.Round((double)h.Wage, 2);
            }
            w.EndArray();

            w.BeginArray("moved");
            foreach (var m in moved)
            {
                w.BeginObject();
                w.Prop("employeeId", m.Req.EmployeeId);
                w.Prop("name", m.Name);
                w.Prop("from", m.Source != null ? m.Source.BusinessName : null);
                w.Prop("to", m.Target.Reg != null ? m.Target.Reg.BusinessName : null);
                w.Prop("shiftsCleared", m.ShiftsCleared);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("skipped");
            foreach (var s in skipped)
            {
                w.BeginObject();
                w.Prop("candidateId", s.CandidateId);
                w.Prop("name", s.Name);
                w.Prop("reason", "gone");
                w.Prop("hoursDropped", s.HoursDropped);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("sites");
            foreach (var site in sites)
            {
                w.BeginObject();
                WriteService.WriteAddress(w, "address", site.Req.Address.Street, site.Req.Address.Number);
                w.Prop("business", site.Reg != null ? site.Reg.BusinessName : null);
                if (site.Week != null)
                {
                    ScheduleWrite.WriteWeek(w, site.Week, site.Error == null && !site.Week.Failed, away);
                }
                else
                {
                    // Assign only, or refused before its shifts were judged.
                    w.PropNull("before");
                    w.PropNull("after");
                    w.Prop("removed", 0);
                    w.Prop("added", 0);
                    w.Prop("openedHours", false);
                    w.BeginArray("leftWithout");
                    w.EndArray();
                    w.BeginArray("warnings");
                    w.EndArray();
                }
                w.Prop("siteError", site.Error);
                w.EndObject();
            }
            w.EndArray();

            w.Prop("wageAdded", Math.Round(wageAdded, 2));
            WriteRows(w, rows);
            w.EndObject();
            return new WriteAnswer(200, w.ToString());
        }

        /// <summary>An apply with any row: nothing written; changed when any row is, so the page refreshes and re-plans.</summary>
        private static WriteAnswer Refused(List<Row> rows)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", rows.Exists(r => r.Error == "changed") ? "changed" : "refused");
            WriteRows(w, rows);
            w.EndObject();
            return new WriteAnswer(409, w.ToString());
        }

        /// <summary>Moves first, then hires, then sites with their shifts, each in request order (the order they were added).</summary>
        private static void WriteRows(JsonWriter w, List<Row> rows)
        {
            w.BeginArray("rows");
            foreach (var r in rows)
            {
                w.BeginObject();
                w.Prop("scope", r.Scope);
                if (r.Id != null) w.Prop("id", r.Id);
                if (r.HasAddress) WriteService.WriteAddress(w, "address", r.Address.Street, r.Address.Number);
                if (r.HasShift)
                {
                    w.Prop("d", r.D);
                    w.Prop("i", r.I);
                }
                w.Prop("error", r.Error);
                w.EndObject();
            }
            w.EndArray();
        }
    }
}
