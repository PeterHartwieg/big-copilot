using System;
using System.Collections.Generic;
using System.Reflection;

namespace BigCopilotLink
{
    /// <summary>Optional Street Food integration; all calls run on the main thread.</summary>
    public static class StreetFoodSnapshot
    {
        private const string StateKey = "foodtrucks:state";
        private const string MarkerKey = "bigcopilot:street-food-snapshot.v1";

        private static Type Provider()
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType("FoodTrucks.BigCopilotSnapshot", false);
                if (type != null) return type;
            }
            return null;
        }

        public static MethodInfo RouteMethod()
        {
            var provider = Provider();
            return provider == null ? null : provider.GetMethod("RouteV1", new[] { typeof(GameInstance), typeof(string), typeof(bool) });
        }

        private static bool HasState(GameInstance instance)
        {
            if (instance.modData != null && instance.modData.ContainsKey(StateKey)) return true;
            if (instance.VehicleInstances != null)
                foreach (var vehicle in instance.VehicleInstances)
                    if (vehicle != null && (vehicle.vehicleTypeName == "foodtrucks:vehicletype_foodcart"
                        || vehicle.vehicleTypeName == "foodtrucks:vehicletype_foodtruck")) return true;
            if (instance.privateDriverVehicleInstances != null)
                foreach (var vehicle in instance.privateDriverVehicleInstances)
                    if (vehicle != null && (vehicle.vehicleTypeName == "foodtrucks:vehicletype_foodcart"
                        || vehicle.vehicleTypeName == "foodtrucks:vehicletype_foodtruck")) return true;
            return false;
        }

        /// <summary>Read the live instance and write only Street Food keys into the private snapshot.</summary>
        public static void CaptureInto(GameInstance instance, IDictionary<string, string> destination)
        {
            string state = null;
            string facts = null;
            try
            {
                var provider = Provider();
                if (provider == null && !HasState(instance)) return;
                var method = provider == null ? null : provider.GetMethod("CaptureV1",
                    new[] { typeof(GameInstance) });
                state = method == null ? null : method.Invoke(null, new object[] { instance }) as string;
                var factsMethod = provider == null ? null : provider.GetMethod("CaptureFactsV1", new[] { typeof(GameInstance) });
                facts = factsMethod == null ? null : factsMethod.Invoke(null, new object[] { instance }) as string;
                if (facts != null) JsonReader.Obj(JsonReader.Parse(facts), "Street Food facts");
                if (state != null && (state.Length == 0 || state.Length > 8 * 1024 * 1024))
                    state = null;
            }
            catch (Exception) { state = null; facts = null; }
            if (state != null) destination[StateKey] = state;
            destination[MarkerKey] = state == null
                ? "{\"status\":\"unavailable\"}" : (facts ?? "{\"status\":\"fresh\"}");
        }

        /// <summary>Fail closed when an installed mod cannot report current crew ownership.</summary>
        public static bool Reserved(GameInstance instance, string employeeId)
        {
            var provider = Provider();
            if (provider == null && !HasState(instance)) return false;
            try
            {
                var method = provider == null ? null : provider.GetMethod("IsCrewV1",
                    new[] { typeof(GameInstance), typeof(string) });
                return method == null || (bool)method.Invoke(null, new object[] { instance, employeeId });
            }
            catch (Exception) { return true; }
        }
    }
}
