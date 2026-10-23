using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>Pure optional providers overlaid on one private save root. Never bless retained saved output.</summary>
    public static class CompanionSnapshots
    {
        internal const int MaxBytes = 4 * 1024 * 1024;
        internal sealed class Provider
        {
            internal string Type, Id, StateKey, MarkerKey, Prefix;
        }
        private static readonly Provider[] Providers = {
            new Provider { Type = "RealLifeOverhaul.Companion", Id = "rlo", StateKey = "reallife:companion", MarkerKey = "bigcopilot:rlo-snapshot.v1", Prefix = "reallife:" },
            new Provider { Type = "HARTModPack.Companion", Id = "hart-mod-pack", StateKey = "hartmodpack:companion", MarkerKey = "bigcopilot:hart-snapshot.v1", Prefix = "hartmodpack:" }
        };

        internal static Type UniqueType(string name)
        {
            // Two mod instances in one assembly share the same owner; distinct assembly
            // objects with the same name are ambiguous even if their versions match.
            var types = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType(name, false))
                .Where(t => t != null).ToArray();
            return types.Length == 1 ? types[0] : null;
        }

        internal static bool Present(string type)
        {
            return AppDomain.CurrentDomain.GetAssemblies().Any(a => a.GetType(type, false) != null);
        }

        internal static MethodInfo Method(string type, string name, params Type[] args)
        {
            var found = UniqueType(type);
            var method = found == null ? null : found.GetMethod(name, BindingFlags.Public | BindingFlags.Static, null, args, null);
            return method != null && method.ReturnType == typeof(string) ? method : null;
        }

        public static MethodInfo RloProvider() { return Method(Providers[0].Type, "CaptureV1", typeof(GameInstance)); }
        public static MethodInfo HartProvider() { return Method(Providers[1].Type, "CaptureV1", typeof(GameInstance)); }

        public static GameInstance Capture(GameInstance instance)
        {
            string digest;
            return CaptureWithDigest(instance, out digest);
        }

        internal static GameInstance CaptureWithDigest(GameInstance instance, out string digest)
        {
            var copy = (GameInstance)typeof(object).GetMethod("MemberwiseClone",
                BindingFlags.Instance | BindingFlags.NonPublic).Invoke(instance, null);
            copy.modData = instance.modData == null ? new Dictionary<string, string>()
                : new Dictionary<string, string>(instance.modData);
            digest = CaptureReports(instance, copy.modData);
            StreetFoodSnapshot.CaptureInto(instance, copy.modData);
            return copy;
        }

        internal static string CurrentDigest(GameInstance instance) { return CaptureReports(instance, null); }

        internal static Dictionary<string, object> ReadReport(GameInstance instance, string type, string id, out string raw)
        {
            raw = null;
            try
            {
                var provider = Method(type, "CaptureV1", typeof(GameInstance));
                if (provider == null || instance == null) return null;
                var text = provider.Invoke(null, new object[] { instance }) as string;
                if (string.IsNullOrEmpty(text) || Encoding.UTF8.GetByteCount(text) > MaxBytes) return null;
                var report = JsonReader.Obj(JsonReader.ParseStrict(text), "companion");
                if (JsonReader.Num(report, "schemaVersion", "companion") != 1 || JsonReader.Str(report, "provider", "companion", true) != id) return null;
                var version = JsonReader.Str(report, "modVersion", "companion", true);
                if (string.IsNullOrEmpty(version) || version.Length > 128) return null;
                JsonReader.Obj(JsonReader.Get(report, "modules"), "companion.modules");
                var clock = JsonReader.Obj(JsonReader.Get(report, "captured"), "companion.captured");
                if (JsonReader.Str(clock, "character", "captured", true) != instance.characterId
                    || JsonReader.Num(clock, "day", "captured") != instance.Day
                    || JsonReader.Num(clock, "hour", "captured") != instance.Hour
                    || JsonReader.Num(clock, "minute", "captured") != Math.Floor(instance.Minute)) return null;
                raw = text;
                return report;
            }
            catch (Exception) { return null; }
        }

        private static string CaptureReports(GameInstance instance, IDictionary<string, string> destination)
        {
            if (instance == null) throw new InvalidOperationException("No current companion session");
            var summaries = new List<object>();
            foreach (var spec in Providers)
            {
                var assemblies = AppDomain.CurrentDomain.GetAssemblies().Where(a => a.GetType(spec.Type, false) != null).ToArray();
                string raw;
                var report = ReadReport(instance, spec.Type, spec.Id, out raw);
                var identity = assemblies.Select(a => a.FullName + ":" + a.ManifestModule.ModuleVersionId + ":" + RuntimeHelpers.GetHashCode(a))
                    .OrderBy(s => s, StringComparer.Ordinal).ToArray();
                if (report != null) report.Remove("captured"); // Only the clock may progress during the asynchronous walk.
                summaries.Add(new Dictionary<string, object> { { "provider", spec.Id }, { "assemblies", identity }, { "report", report } });
                if (destination == null) continue;
                var evidence = assemblies.Length > 0 || destination.Keys.Any(k => k.StartsWith(spec.Prefix, StringComparison.Ordinal) || k == spec.MarkerKey);
                destination.Remove(spec.StateKey);
                destination.Remove(spec.MarkerKey);
                if (!evidence) continue;
                if (raw != null) destination[spec.StateKey] = raw;
                destination[spec.MarkerKey] = raw == null ? "{\"status\":\"unavailable\"}"
                    : "{\"status\":\"fresh\",\"sha256\":\"" + BuildingFacts.Hash(Encoding.UTF8.GetBytes(raw)) + "\"}";
            }
            var writer = new JsonWriter();
            writer.Tree(new Dictionary<string, object> { { "character", instance.characterId }, { "providers", summaries } });
            return BuildingFacts.Hash(Encoding.UTF8.GetBytes(writer.ToString()));
        }
    }
}
