using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
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
        var capture = typeof(StreetFoodSnapshot).GetMethod("Capture");
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
}
