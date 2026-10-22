using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>Optional mod reports captured against the live instance and overlaid on one private snapshot.</summary>
    public static class CompanionSnapshots
    {
        private const string StateKey = "reallife:companion";
        private const string MarkerKey = "bigcopilot:rlo-snapshot.v1";
        private const int MaxBytes = 4 * 1024 * 1024;

        public static MethodInfo RloProvider()
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType("RealLifeOverhaul.Companion", false);
                var method = type == null ? null : type.GetMethod("CaptureV1", BindingFlags.Public | BindingFlags.Static,
                    null, new[] { typeof(GameInstance) }, null);
                if (method != null && method.ReturnType == typeof(string)) return method;
            }
            return null;
        }

        public static GameInstance Capture(GameInstance instance)
        {
            var copy = (GameInstance)typeof(object).GetMethod("MemberwiseClone",
                BindingFlags.Instance | BindingFlags.NonPublic).Invoke(instance, null);
            copy.modData = instance.modData == null ? new Dictionary<string, string>()
                : new Dictionary<string, string>(instance.modData);
            CaptureRloInto(instance, copy.modData);
            StreetFoodSnapshot.CaptureInto(instance, copy.modData);
            return copy;
        }

        private static void CaptureRloInto(GameInstance instance, IDictionary<string, string> destination)
        {
            var evidence = false;
            if (instance.modData != null)
                foreach (var key in instance.modData.Keys)
                    if (key.StartsWith("reallife:", StringComparison.Ordinal) || key == MarkerKey) { evidence = true; break; }
            string state = null;
            try
            {
                var provider = RloProvider();
                if (provider == null && !evidence) return;
                state = provider == null ? null : provider.Invoke(null, new object[] { instance }) as string;
                if (state != null && (state.Length == 0 || Encoding.UTF8.GetByteCount(state) > MaxBytes)) state = null;
                if (state != null) JsonReader.Obj(JsonReader.Parse(state), "RLO companion capture");
            }
            catch (Exception) { state = null; }
            if (state != null) destination[StateKey] = state;
            destination[MarkerKey] = state == null ? "{\"status\":\"unavailable\"}"
                : "{\"status\":\"fresh\",\"sha256\":\"" + BuildingFacts.Hash(Encoding.UTF8.GetBytes(state)) + "\"}";
        }
    }
}
