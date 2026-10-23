using System;
using System.Reflection;
using System.Linq;

namespace BigCopilotLink
{
    /// <summary>Read-only capability observations, not a replacement economy model.
    /// Unknown settings remain unknown. Never call HMP's private Ready method: it
    /// can warn, mutate failure state and touch the careers director.</summary>
    internal static class EconomyFacts
    {
        internal static void Write(JsonWriter w)
        {
            w.BeginObject("economy");
            w.Prop("schemaVersion", 1);
            w.Prop("model", "economy-capabilities-v1");
            w.BeginArray("providers");
            var providers = AppDomain.CurrentDomain.GetAssemblies()
                .Where(a => a.GetName().Name == "HardModePatch" || a.GetName().Name == "HARTModPack" || a.GetName().Name == "RealLifeOverhaul")
                .GroupBy(a => a.GetName().Name)
                .OrderBy(group => group.Key, StringComparer.Ordinal);
            foreach (var provider in providers)
            {
                var assemblies = provider.ToArray();
                var ambiguous = assemblies.Length != 1;
                var versions = assemblies.Select(a => a.GetName().Version)
                    .Select(v => v == null ? "unknown" : v.ToString())
                    .Distinct().OrderBy(v => v, StringComparer.Ordinal).ToArray();
                w.BeginObject();
                w.Prop("id", provider.Key == "HardModePatch" ? "hard-mode-patch" : provider.Key == "HARTModPack" ? "hart-mod-pack" : "real-life-overhaul");
                w.Prop("version", string.Join(", ", versions));
                if (provider.Key == "HardModePatch")
                {
                    // Duplicate assemblies do not establish which instance's
                    // options are effective. Do not invoke either one's readers.
                    bool? equipment = ambiguous ? null : Rule(assemblies[0], "EquipmentUtilities");
                    bool? office = ambiguous ? null : Rule(assemblies[0], "OfficeIt");
                    bool? diplomas = ambiguous ? null : Rule(assemblies[0], "FactoryDiplomas");
                    bool? available = ambiguous ? null : Available(assemblies[0]);
                    w.Prop("status", equipment.HasValue && office.HasValue && diplomas.HasValue && available.HasValue
                        ? "observed" : "unavailable");
                    Bool(w, "runningCostsAvailable", available);
                    w.Prop("provenance", "legacy-selected-options");
                    w.BeginObject("rules");
                    Bool(w, "equipmentUtilities", equipment);
                    Bool(w, "officeIt", office);
                    Bool(w, "factoryDiplomas", diplomas);
                    w.EndObject();
                }
                else if (provider.Key == "HARTModPack")
                {
                    // Current pack effective state belongs to its pure companion runtime
                    // module. Options (or a blocked pack) never prove legacy behaviour.
                    w.Prop("status", "unavailable");
                    w.Prop("source", "hartmodpack:companion");
                    w.Prop("ambiguous", ambiguous);
                    w.BeginObject("rules");
                    w.PropNull("equipmentUtilities"); w.PropNull("officeIt"); w.PropNull("factoryDiplomas");
                    w.EndObject();
                }
                else
                {
                    // Assembly presence proves neither utilities nor internet are on.
                    // No reviewed public provider exposes their effective state yet.
                    w.Prop("status", "unavailable");
                    w.BeginObject("rules");
                    w.PropNull("operatingCosts");
                    w.EndObject();
                }
                w.EndObject();
            }
            w.EndArray();
            w.EndObject();
        }

        private static bool? Rule(Assembly assembly, string name)
        {
            try
            {
                var type = assembly.GetType("HardModePatch.Core.Rules", false);
                var field = type == null ? null : type.GetField(name, BindingFlags.Public | BindingFlags.Static);
                var rule = field == null ? null : field.GetValue(null);
                var enabled = rule == null ? null : rule.GetType().GetField("Enabled", BindingFlags.Public | BindingFlags.Instance);
                return enabled != null && enabled.FieldType == typeof(bool) ? (bool?)enabled.GetValue(rule) : null;
            }
            catch (Exception) { return null; }
        }

        private static bool? Available(Assembly assembly)
        {
            try
            {
                var type = assembly.GetType("HardModePatch.RunningCostsPatch", false);
                var property = type == null ? null : type.GetProperty("Available", BindingFlags.Public | BindingFlags.Static);
                return property != null && property.PropertyType == typeof(bool) ? (bool?)property.GetValue(null, null) : null;
            }
            catch (Exception) { return null; }
        }

        private static void Bool(JsonWriter w, string name, bool? value)
        {
            if (value.HasValue) w.Prop(name, value.Value); else w.PropNull(name);
        }
    }
}
