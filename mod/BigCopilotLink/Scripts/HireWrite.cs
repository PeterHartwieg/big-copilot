using System;
using System.Collections.Generic;
using System.Globalization;
using Entities;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/hire (from 0.3.0): hires headhunter candidates into sites, moves
    /// employees between sites, and writes the weeks of the sites involved, in one call
    /// (docs/game-link-api.md, docs/mod-write-back-scope.md section 11). The moves are the
    /// game's MyEmployees "Assign business" mass action (AssignBusinessMassAction's
    /// closure, build 3682 IL), the hires its "Assign business and hire"
    /// (AssignToBusinessAndHireMassAction.HireAndAssignBusiness's closure), calling the
    /// same game helpers rather than copying their bodies; the weeks are ScheduleWrite's
    /// checks and apply, judged as if the call's moves and hires had happened. There is no
    /// undo. A candidate who has left the game's list is skipped, never refused.
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
            foreach (var site in siteKeys)
                if (!targets.Contains(site) && !sources.Contains(site))
                    throw new BadRequestException("body.sites names a site no hire or move touches");
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
                    Name = NameOf(employee), ShiftsCleared = ShiftsOf(source, move.EmployeeId)
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
                Finish(ws, hired.Count, moved.Count, weeks, weekBusiness);
                return WriteService.CannotWrite("other");
            }

            ForgetScheduleUndo(ws, written);
            var stamp = Finish(ws, hired.Count, moved.Count, weeks, weekBusiness);
            return Answer(false, true, false, stamp, hired, moved, skipped, sites, away, rows);
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

        /// <summary>The schedule kind's undo belongs to a site this call wrote: it would restore over the call.</summary>
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

        // ---- the answer ------------------------------------------------------------

        private static WriteAnswer Answer(bool dryRun, bool ok, bool blocked, string stamp, List<Hired> hired, List<Moved> moved,
            List<Skipped> skipped, List<SiteState> sites, HashSet<string> away, List<Row> rows)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("ok", ok);
            w.Prop("kind", "hire");
            w.Prop("dryRun", dryRun);
            if (stamp != null) w.Prop("stamp", stamp);
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
