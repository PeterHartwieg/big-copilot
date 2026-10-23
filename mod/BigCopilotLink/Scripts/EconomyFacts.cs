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
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies().OrderBy(a => a.FullName, StringComparer.Ordinal))
            {
                var name = assembly.GetName();
                if (name.Name != "HardModePatch" && name.Name != "RealLifeOverhaul") continue;
                w.BeginObject();
                w.Prop("id", name.Name == "HardModePatch" ? "hard-mode-patch" : "real-life-overhaul");
                w.Prop("version", name.Version == null ? "unknown" : name.Version.ToString());
                if (name.Name == "HardModePatch")
                {
                    bool? equipment = Rule(assembly, "EquipmentUtilities");
                    bool? office = Rule(assembly, "OfficeIt");
                    bool? diplomas = Rule(assembly, "FactoryDiplomas");
                    bool? available = Available(assembly);
                    w.Prop("status", equipment.HasValue && office.HasValue && diplomas.HasValue && available.HasValue
                        ? "observed" : "unavailable");
                    Bool(w, "runningCostsAvailable", available);
                    w.BeginObject("rules");
                    Bool(w, "equipmentUtilities", equipment);
                    Bool(w, "officeIt", office);
                    Bool(w, "factoryDiplomas", diplomas);
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
