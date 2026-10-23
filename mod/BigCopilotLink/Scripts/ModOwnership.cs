using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>Fresh main-thread owner query. Only explicit allowed can cross the mutation boundary.</summary>
    internal static class ModOwnership
    {
        internal static Dictionary<string, object> Target(WireAddress address)
        {
            return new Dictionary<string, object> { { "street", address.Street }, { "number", address.Number } };
        }

        internal static WriteAnswer? Check(string operation, string phase, IEnumerable<Dictionary<string, object>> targets)
        {
            var game = SaveGameManager.Current;
            // Saved reports alone cannot establish a loaded competing owner. An assembly
            // without a public API does: it must use the fresh, conservative fallback.
            var present = AppDomain.CurrentDomain.GetAssemblies().Any(a => a.GetName().Name == "RealLifeOverhaul"
                || a.GetType("RealLifeOverhaul.Companion", false) != null);
            if (!present) return null;
            try
            {
                var currentTargets = targets.ToArray();
                if (currentTargets.Length == 0) return null; // No mutation to authorize.
                if ((operation == "schedule" || operation == "hire") && currentTargets.Any(target =>
                    (operation == "schedule" || !Equals(JsonReader.Get(target, "scheduling"), false)) && !CompleteWeek(target)))
                    return Unknown("ownership-week-incomplete");
                targets = currentTargets;
                var method = CompanionSnapshots.Method("RealLifeOverhaul.Companion", "OwnershipV1", typeof(GameInstance), typeof(string));
                if (method == null) return Legacy(game, operation, targets);
                var w = new JsonWriter();
                w.Tree(new Dictionary<string, object> { { "schemaVersion", 1 }, { "operation", operation }, { "phase", phase }, { "targets", targets.ToArray() } });
                var raw = method.Invoke(null, new object[] { game, w.ToString() }) as string;
                if (string.IsNullOrEmpty(raw) || Encoding.UTF8.GetByteCount(raw) > 256 * 1024) return Unknown("invalid-owner-response");
                var result = JsonReader.Obj(JsonReader.ParseStrict(raw), "ownership");
                if (JsonReader.Num(result, "schemaVersion", "ownership") != 1) return Unknown("unsupported-owner-response");
                var decision = JsonReader.Str(result, "decision", "ownership", true);
                if (decision != "allowed" && decision != "conditional" && decision != "refused" && decision != "unknown") return Unknown("invalid-owner-decision");
                // Validate the entire response even for allowed; malformed responses are never permission.
                var owner = JsonReader.Str(result, "owner", "ownership", true);
                var task = JsonReader.Str(result, "task", "ownership", true);
                var reasons = Strings(result, "reasons");
                var effects = Strings(result, "effects");
                if (decision == "allowed") return null;
                return Refuse(decision == "unknown" ? "ownership_unknown" : "mod_owned", owner, task, reasons, effects);
            }
            catch (Exception) { return Unknown("owner-query-failed"); }
        }

        private static string[] Strings(Dictionary<string, object> result, string key)
        {
            var values = JsonReader.Arr(JsonReader.Get(result, key), key);
            if (values.Count > 256 || values.Any(v => !(v is string) || ((string)v).Length > 4096))
                throw new BadRequestException("Invalid ownership " + key);
            return values.Cast<string>().ToArray();
        }

        private static WriteAnswer? Legacy(GameInstance game, string operation, IEnumerable<Dictionary<string, object>> targets)
        {
            string raw;
            var report = CompanionSnapshots.ReadReport(game, "RealLifeOverhaul.Companion", "rlo", out raw);
            if (report == null) return Unknown("fresh-owner-report-unavailable");
            var modules = JsonReader.Obj(JsonReader.Get(report, "modules"), "modules");
            var features = JsonReader.Obj(JsonReader.Get(modules, "features"), "features");
            if (JsonReader.Num(features, "version", "features") != 1 || JsonReader.Str(features, "status", "features", true) != "ready")
                return Unknown("fresh-owner-features-unavailable");
            var rows = JsonReader.Arr(JsonReader.Get(features, "data"), "features.data");
            var feature = operation == "rent" ? "estate" : "managers";
            var matches = rows.Select(row => JsonReader.Obj(row, "feature")).Where(row => JsonReader.Str(row, "id", "feature", true) == feature).ToArray();
            // enabled=true/running=false is not off: the director may start or recover.
            if (matches.Length == 1 && JsonReader.Get(matches[0], "enabled") is bool && !(bool)JsonReader.Get(matches[0], "enabled"))
            {
                if (operation == "rent" || operation == "wholesale") return null;
                var company = rows.Select(row => JsonReader.Obj(row, "feature"))
                    .Where(row => JsonReader.Str(row, "id", "feature", true) == "company").ToArray();
                if (company.Length == 1 && JsonReader.Get(company[0], "enabled") is bool && !(bool)JsonReader.Get(company[0], "enabled")) return null;
                // Legacy CaptureV1 has no current permit proof. Its Company director
                // can enforce licences even while managers are disabled.
                foreach (var target in targets)
                {
                    if (operation == "hire" && JsonReader.Get(target, "scheduling") is bool && !(bool)target["scheduling"]) continue;
                    if (!DaytimeWeek(target)) return Unknown("legacy-late-opening-permit-unverified");
                }
                return null;
            }
            return Unknown("fresh-" + feature + "-disabled-proof-required");
        }

        private static bool CompleteWeek(Dictionary<string, object> target)
        {
            try
            {
                var week = JsonReader.Arr(JsonReader.Get(target, "week"), "week");
                var days = week.Select(row => WeekNumber(JsonReader.Obj(row, "day"), "day")).ToArray();
                return days.Length == 7 && days.Distinct().Count() == 7 && days.All(d => d >= 0 && d <= 6 && d == Math.Floor(d));
            }
            catch (Exception) { return false; }
        }

        private static bool DaytimeWeek(Dictionary<string, object> target)
        {
            try
            {
                var week = JsonReader.Arr(JsonReader.Get(target, "week"), "week");
                if (week.Count != 7) return false;
                var days = new HashSet<double>();
                foreach (var value in week)
                {
                    var day = JsonReader.Obj(value, "day");
                    var number = WeekNumber(day, "day");
                    if (number < 0 || number > 6 || number != Math.Floor(number) || !days.Add(number)) return false;
                    var open = JsonReader.Get(day, "isOpen");
                    if (!(open is bool)) return false;
                    if (!(bool)open) continue;
                    foreach (var slot in JsonReader.Arr(JsonReader.Get(day, "hours"), "hours"))
                    {
                        var interval = JsonReader.Obj(slot, "interval");
                        var from = WeekNumber(interval, "from");
                        var to = WeekNumber(interval, "to");
                        if (from < 5 || to > 22 || from > to || from != Math.Floor(from) || to != Math.Floor(to)) return false;
                    }
                }
                return true;
            }
            catch (Exception) { return false; }
        }

        private static double WeekNumber(Dictionary<string, object> row, string key)
        {
            var value = JsonReader.Get(row, key);
            // Builders hold native integers; parsed wire fixtures hold doubles.
            if (!(value is int) && !(value is double)) throw new ArgumentException("Invalid week number");
            return Convert.ToDouble(value);
        }

        private static WriteAnswer Unknown(string reason)
        {
            return Refuse("ownership_unknown", "rlo", "unknown", new[] { reason }, new string[0]);
        }

        private static WriteAnswer Refuse(string error, string owner, string task, string[] reasons, string[] effects)
        {
            var w = new JsonWriter();
            w.Tree(new Dictionary<string, object> { { "error", error }, { "owner", owner }, { "task", task }, { "reasons", reasons }, { "effects", effects } });
            return new WriteAnswer(409, w.ToString());
        }
    }
}
