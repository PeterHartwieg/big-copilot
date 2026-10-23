using System;
using System.Collections.Generic;

namespace BigCopilotLink
{
    // Wire responses for hire review/apply and undo; JSON field order stays stable.
    public static partial class HireWrite
    {
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
