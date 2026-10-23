using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Reflection;
using System.Runtime.Serialization;
using BigCopilotLink;
using UnityEditor;
using UnityEngine;

/// <summary>Run in an empty SDK with both mods compiled. No player save or gameplay writes.</summary>
public static class BclStreetFoodTests
{
    const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
    static Type TypeNamed(string name) => AppDomain.CurrentDomain.GetAssemblies()
        .Select(a => a.GetType(name, false)).First(t => t != null);
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }

    public static void Run()
    {
        try { Exercise(); Debug.Log("[BclStreetFoodTests] passed"); EditorApplication.Exit(0); }
        catch (Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
    }

    static void Exercise()
    {
        var capture = typeof(CompanionSnapshots).GetMethod("Capture");
        var reserved = typeof(StreetFoodSnapshot).GetMethod("Reserved");
        var gameType = capture.GetParameters()[0].ParameterType;
        var instance = FormatterServices.GetUninitializedObject(gameType);
        var modData = gameType.GetField("modData", Any);
        var original = new Dictionary<string, string> { ["foodtrucks:state"] = "old", ["another-mod"] = "untouched" };
        modData.SetValue(instance, original);
        var session = TypeNamed("FoodTrucks.FoodTrucksSession");
        var game = session.GetField("game", Any);
        var state = session.GetField("state", Any);
        var canWrite = session.GetField("canWrite", Any);
        var manager = TypeNamed("SaveGameManager");
        var current = manager.GetField("_current", Any);
        Check(current != null, "Game's current-instance field must be found");
        var oldGame = game.GetValue(null);
        var oldState = state.GetValue(null);
        var oldWrite = canWrite.GetValue(null);
        var oldCurrent = current.GetValue(null);
        try
        {
            current.SetValue(null, instance);
            game.SetValue(null, instance);
            var model = Activator.CreateInstance(state.FieldType);
            state.SetValue(null, model);
            var vehicles = (IList)state.FieldType.GetProperty("Vehicles").GetValue(model);
            var vehicle = Activator.CreateInstance(TypeNamed("FoodTrucks.Core.Saves.VehicleState"));
            vehicle.GetType().GetProperty("VehicleId").SetValue(vehicle, "test-cart");
            var crew = (IList)vehicle.GetType().GetProperty("Crew").GetValue(vehicle);
            crew.Add("crew");
            vehicles.Add(vehicle);
            canWrite.SetValue(null, false);
            var unavailable = capture.Invoke(null, new[] { instance });
            var data = (Dictionary<string, string>)modData.GetValue(unavailable);
            Check(data["bigcopilot:street-food-snapshot.v1"].Contains("unavailable"), "Unavailable session is marked");
            Check((bool)reserved.Invoke(null, new[] { instance, "free" }), "Unavailable crew ownership fails closed");

            canWrite.SetValue(null, true);
            var copy = capture.Invoke(null, new[] { instance });
            data = (Dictionary<string, string>)modData.GetValue(copy);
            Check(!ReferenceEquals(copy, instance) && !ReferenceEquals(data, original), "Snapshot owns its root and mod data");
            Check(data["bigcopilot:street-food-snapshot.v1"].Contains("fresh"), "Attached session is fresh");
            Check(data["foodtrucks:state"].Contains("test-cart"), "Snapshot reads current runtime state");
            Check(original.Count == 2 && original["foodtrucks:state"] == "old", "Capture never mutates live mod data");
            Check(data["another-mod"] == "untouched", "Other mods are preserved");
            Check((int)state.FieldType.GetProperty("SaveCount").GetValue(model) == 0, "Capture is not a game save");
            Check((bool)reserved.Invoke(null, new[] { instance, "crew" }), "Current crew is reserved");
            Check(!(bool)reserved.Invoke(null, new[] { instance, "free" }), "Free employees remain available");
            var frozen = data["foodtrucks:state"];
            crew.Add("free");
            Check(data["foodtrucks:state"] == frozen, "Captured state is immutable");
            Check((bool)reserved.Invoke(null, new[] { instance, "free" }), "Write preflight reads changed crew ownership");
            ExerciseRoute(instance, vehicle);
            game.SetValue(null, null);
            data = (Dictionary<string, string>)modData.GetValue(capture.Invoke(null, new[] { instance }));
            Check(data["bigcopilot:street-food-snapshot.v1"].Contains("unavailable"), "Different session cannot report freshness");
        }
        finally
        {
            current.SetValue(null, oldCurrent);
            game.SetValue(null, oldGame);
            state.SetValue(null, oldState);
            canWrite.SetValue(null, oldWrite);
        }
    }

    static void ExerciseRoute(object instance, object vehicle)
    {
        var demand = TypeNamed("FoodTrucks.DemandData");
        var rules = demand.GetProperty("Rules", Any);
        var oldRules = rules.GetValue(null);
        var crew = (IList)vehicle.GetType().GetProperty("Crew").GetValue(vehicle);
        crew.Clear();
        try
        {
            var ruleText = File.ReadAllText(Environment.GetEnvironmentVariable("BCL_STREET_FOOD_RULES"));
            rules.SetValue(null, rules.PropertyType.GetMethod("Parse").Invoke(null, new object[] { ruleText }));
            var field = instance.GetType().GetField("VehicleInstances", Any);
            var physical = (IList)Activator.CreateInstance(field.FieldType);
            var physicalType = field.FieldType.GetGenericArguments()[0];
            var cart = FormatterServices.GetUninitializedObject(physicalType);
            physicalType.GetField("id", Any).SetValue(cart, "test-cart");
            physicalType.GetField("vehicleTypeName", Any).SetValue(cart, "foodtrucks:vehicletype_foodcart");
            physical.Add(cart);
            field.SetValue(instance, physical);
            var scheduleProperty = vehicle.GetType().GetProperty("Schedule");
            var schedule = Activator.CreateInstance(scheduleProperty.PropertyType);
            scheduleProperty.SetValue(vehicle, schedule);
            var stops = (IList)schedule.GetType().GetProperty("Stops").GetValue(schedule);
            var stop = Activator.CreateInstance(TypeNamed("FoodTrucks.Core.Saves.ScheduleStop"));
            foreach (var item in new Dictionary<string, object> { ["Day"] = DayOfWeek.Monday,
                ["SpotKey"] = "synthetic", ["X"] = 1d, ["Y"] = 0d, ["Z"] = 2d, ["Heading"] = 0d,
                ["OpenAt"] = 600, ["CloseAt"] = 900 })
                stop.GetType().GetProperty(item.Key).SetValue(stop, item.Value);
            stops.Add(stop);
            var provider = TypeNamed("FoodTrucks.BigCopilotSnapshot");
            var route = provider.GetMethod("RouteV1");
            var revision = (string)TypeNamed("FoodTrucks.Core.Fleet.CopilotRoutes").GetMethod("Revision")
                .Invoke(null, new[] { vehicle });
            var body = "{\"vehicleId\":\"test-cart\",\"revision\":\"" + revision +
                "\",\"weekday\":0,\"stops\":[{\"x\":1,\"z\":2,\"open\":600,\"close\":900}]}";
            Func<string, bool, string> call = (json, dry) => (string)route.Invoke(null, new object[] { instance, json, dry });
            var before = provider.GetMethod("CaptureV1").Invoke(null, new[] { instance });
            var review = JsonReader.Obj(JsonReader.Parse(call(body, true)), "review");
            Check(JsonReader.Bool(review, "ok", "review", false), "Provider reviews a valid existing place");
            var quote = JsonReader.Str(review, "quote", "review", true);
            Check(quote.Length == 64, "Review returns a quote");
            Check(Equals(before, provider.GetMethod("CaptureV1").Invoke(null, new[] { instance })), "Review leaves runtime state untouched");
            Check(call(body, false).Contains("changed"), "Apply without the review quote is refused");
            var quoted = body.Substring(0, body.Length - 1) + ",\"quote\":\"" + quote + "\"}";
            Check(call(quoted.Replace("\"close\":900", "\"close\":930"), false).Contains("changed"), "A changed route invalidates its quote");
            Check(call(quoted.Replace(revision, "old"), false).Contains("changed"), "A changed revision is refused");
            Check(JsonReader.Bool(JsonReader.Obj(JsonReader.Parse(call(quoted, false)), "apply"), "ok", "apply", false),
                "The unchanged reviewed route can be applied without a gameplay mutation");
            Check(Equals(before, provider.GetMethod("CaptureV1").Invoke(null, new[] { instance })), "No-change apply is read-only");
            ExerciseReturnCoverage(instance, vehicle, provider);
        }
        finally { rules.SetValue(null, oldRules); }
    }

    static object FromJson(Type type, string json) => TypeNamed("Newtonsoft.Json.JsonConvert")
        .GetMethod("DeserializeObject", new[] { typeof(string), typeof(Type) }).Invoke(null, new object[] { json, type });

    // Replace a bay stop with a remote stop already used on another weekday.
    // Cached synthetic geometry avoids loading a city or probing real parking.
    static void ExerciseReturnCoverage(object instance, object vehicle, Type provider)
    {
        const string siteId = "bcl-test-bay";
        var demand = TypeNamed("FoodTrucks.DemandData");
        var sites = demand.GetProperty("Commissaries", Any);
        var oldSites = sites.GetValue(null);
        var commissary = TypeNamed("FoodTrucks.Commissary");
        var attached = commissary.GetField("attached", Any);
        var uninstalled = commissary.GetField("uninstalled", Any);
        var oldAttached = attached.GetValue(null);
        var oldUninstalled = uninstalled.GetValue(null);
        var places = (IDictionary)commissary.GetField("bayPlaceCache", Any).GetValue(null);
        var bayStops = (IDictionary)commissary.GetField("bayStopCache", Any).GetValue(null);
        var oldPlaces = places.Contains(siteId) ? places[siteId] : null;
        var oldStops = bayStops.Contains("test-cart") ? bayStops["test-cart"] : null;
        var employees = (IDictionary)TypeNamed("Helpers.EmployeeHelper").GetField("EmployeeInstancesDictionary", Any).GetValue(null);
        var oldEmployee = employees.Contains("bcl-test-crew") ? employees["bcl-test-crew"] : null;
        try
        {
            sites.SetValue(null, sites.PropertyType.GetMethod("Parse").Invoke(null, new object[] {
                "{\"schemaVersion\":1,\"commissaries\":[{\"id\":\"bcl-test-bay\",\"name\":\"Test bay\",\"address\":\"ba:street_test#1\",\"bay\":{\"x\":1,\"z\":2}}]}" }));
            attached.SetValue(null, true);
            uninstalled.SetValue(null, false);
            var state = TypeNamed("FoodTrucks.FoodTrucksSession").GetProperty("CurrentState", Any).GetValue(null);
            var home = state.GetType().GetProperty("Commissary");
            var rule = TypeNamed("FoodTrucks.Core.Commissary.BaySnap").GetField("RuleVersion").GetRawConstantValue();
            home.SetValue(state, FromJson(home.PropertyType, "{\"spaces\":[{\"vehicleId\":\"test-cart\",\"kind\":\"cart\",\"commissaryId\":\"bcl-test-bay\"}]," +
                "\"bays\":{\"bcl-test-bay\":{\"rule\":" + rule + ",\"origins\":[{\"x\":1,\"z\":2}],\"points\":[{\"x\":1,\"z\":2,\"alongZ\":1}]}}}"));
            var pointKey = $"{1d:F1},{2d:F1}";
            var half = (Vector3)TypeNamed("FoodTrucks.HireRoutes").GetField("CartHalfSize", Any).GetValue(null);
            places[siteId] = Activator.CreateInstance(places.GetType().GetGenericArguments()[1],
                new object[] { $"{siteId}|{half.z:F2}|{pointKey}", new List<(Vector3, Quaternion)> { (new Vector3(1, 0, 2), Quaternion.identity) } });
            bayStops["test-cart"] = Activator.CreateInstance(bayStops.GetType().GetGenericArguments()[1],
                new object[] { $"{siteId}|{pointKey}|{pointKey};{101d:F1},{2d:F1}", new List<int> { 0 } });
            var schedule = vehicle.GetType().GetProperty("Schedule");
            schedule.SetValue(vehicle, FromJson(schedule.PropertyType, "{\"stops\":[" +
                "{\"day\":1,\"spotKey\":\"bay\",\"x\":1,\"z\":2,\"openAt\":660,\"closeAt\":900}," +
                "{\"day\":2,\"spotKey\":\"remote\",\"x\":101,\"z\":2,\"openAt\":660,\"closeAt\":900}]," +
                "\"crewShifts\":[{\"employeeId\":\"bcl-test-crew\",\"day\":1,\"start\":10,\"end\":15}]}"));
            vehicle.GetType().GetProperty("VehicleType").SetValue(vehicle, "cart");
            var crew = (IList)vehicle.GetType().GetProperty("Crew").GetValue(vehicle);
            crew.Clear(); crew.Add("bcl-test-crew");
            var employeeType = employees.GetType().GetGenericArguments()[1];
            var employee = FormatterServices.GetUninitializedObject(employeeType);
            employeeType.GetField("id", Any).SetValue(employee, "bcl-test-crew");
            employees["bcl-test-crew"] = employee;
            var revision = (string)TypeNamed("FoodTrucks.Core.Fleet.CopilotRoutes").GetMethod("Revision").Invoke(null, new[] { vehicle });
            var body = "{\"vehicleId\":\"test-cart\",\"revision\":\"" + revision +
                "\",\"weekday\":0,\"stops\":[{\"x\":101,\"z\":2,\"open\":660,\"close\":900}]}";
            var before = provider.GetMethod("CaptureV1").Invoke(null, new[] { instance });
            var answer = (string)provider.GetMethod("RouteV1").Invoke(null, new object[] { instance, body, true });
            var parsed = JsonReader.Obj(JsonReader.Parse(answer), "review");
            Check(JsonReader.Bool(parsed, "ok", "review", false), "Remote replacement can be reviewed");
            Check(answer.Contains("crew_gap"), "Review includes the uncovered return from the proposed remote stop");
            Check(Equals(before, provider.GetMethod("CaptureV1").Invoke(null, new[] { instance })), "Commissary review leaves live route and crew untouched");
        }
        finally
        {
            sites.SetValue(null, oldSites);
            attached.SetValue(null, oldAttached); uninstalled.SetValue(null, oldUninstalled);
            if (oldPlaces == null) places.Remove(siteId); else places[siteId] = oldPlaces;
            if (oldStops == null) bayStops.Remove("test-cart"); else bayStops["test-cart"] = oldStops;
            if (oldEmployee == null) employees.Remove("bcl-test-crew"); else employees["bcl-test-crew"] = oldEmployee;
        }
    }
}
