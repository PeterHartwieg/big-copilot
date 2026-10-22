using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization;
using System.Security.Cryptography;
using System.Text;
using BigCopilotLink;
using RealLifeOverhaul;
using UnityEditor;
using UnityEngine;

/// <summary>Synthetic SDK check of the real RLO provider and Link capture, without player saves or save events.</summary>
public static class BclRloTests
{
    const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
    static Type TypeNamed(string name) => AppDomain.CurrentDomain.GetAssemblies()
        .Select(a => a.GetType(name, false)).First(t => t != null);
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }

    public static void Run()
    {
        try { Exercise(); Debug.Log("[BclRloTests] passed"); EditorApplication.Exit(0); }
        catch (Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
    }

    static void Exercise()
    {
        var capture = typeof(CompanionSnapshots).GetMethod("Capture");
        var gameType = capture.GetParameters()[0].ParameterType;
        var instance = FormatterServices.GetUninitializedObject(gameType);
        var modData = gameType.GetField("modData", Any);
        var original = new Dictionary<string, string> { ["reallife:companion"] = "old", ["another-mod"] = "untouched" };
        modData.SetValue(instance, original);
        foreach (var pair in new Dictionary<string, object> {
            ["characterId"] = "synthetic", ["SaveGameName"] = "Fixture", ["Day"] = 12,
            ["Hour"] = 8, ["Minute"] = 30.75f, ["buildNumberAtLastSave"] = 2479 })
            gameType.GetField(pair.Key, Any).SetValue(instance, pair.Value);
        FoodTrucks.BigCopilotSnapshot.Expected = instance;
        var current = TypeNamed("SaveGameManager").GetField("_current", Any);
        var loaded = typeof(ModState).GetProperty("Loaded", Any);
        var connected = typeof(Wiring).GetProperty("Connected", Any);
        var oldCurrent = current.GetValue(null);
        var oldLoaded = loaded.GetValue(null);
        var oldConnected = connected.GetValue(null);
        var oldReaders = new Dictionary<string, Func<CompanionModule>>(CompanionBridges.Readers);
        try
        {
            current.SetValue(null, instance);
            loaded.SetValue(null, true);
            connected.SetValue(null, true);
            CompanionBridges.Readers.Clear();
            int calls = 0;
            CompanionBridges.Readers["businesses"] = () => { calls++; return new CompanionModule("ready", new object[0]); };
            CompanionBridges.Readers["credit"] = () => throw new InvalidOperationException("synthetic provider failure");
            Check(CompanionSnapshots.RloProvider() != null, "The optional RLO API is found");
            var providerReport = (string)CompanionSnapshots.RloProvider().Invoke(null, new[] { instance });
            Check(providerReport != null && providerReport.Contains("\"status\":\"failed\""), "RLO's direct API isolates a failed capability");
            Check(providerReport.Contains("\"minute\":30"), "The game's fractional minute becomes an integer contract minute");
            calls = 0;
            FoodTrucks.BigCopilotSnapshot.Calls = 0;
            var copy = capture.Invoke(null, new[] { instance });
            var data = (Dictionary<string, string>)modData.GetValue(copy);
            Check(!ReferenceEquals(copy, instance) && !ReferenceEquals(data, original), "Capture owns its root and mod data");
            Check(calls == 1, "Providers run once per capture");
            Check(FoodTrucks.BigCopilotSnapshot.Calls == 1 && data["foodtrucks:state"] == "synthetic-current"
                && data["bigcopilot:street-food-snapshot.v1"].Contains("fresh"),
                "Both providers receive the original instance and keep their owned snapshot keys");
            Check(original.Count == 2 && original["reallife:companion"] == "old", "Live capture never mutates the running game's mod data");
            Check(data["another-mod"] == "untouched", "Unrelated mod data survives");
            Check(data["reallife:companion"].Contains("\"status\":\"failed\""), "A failed capability is isolated");
            string hash;
            using (var sha = SHA256.Create())
                hash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(data["reallife:companion"]))).Replace("-", "").ToLowerInvariant();
            Check(data["bigcopilot:rlo-snapshot.v1"].Contains(hash), "Fresh marker binds the exact report bytes");
            var frozen = data["reallife:companion"];
            gameType.GetField("Minute", Any).SetValue(instance, 31);
            Check(data["reallife:companion"] == frozen, "Later runtime changes cannot change captured JSON");

            // The ordinary-save entry point writes the same contract without invoking a game save itself.
            typeof(CompanionGame).GetMethod("Save").Invoke(null, new[] { instance });
            Check(original["reallife:companion"].Contains("\"minute\":31"), "Ordinary saves capture the current clock");
            Check(!original.ContainsKey("bigcopilot:rlo-snapshot.v1"), "Link's marker is never written to ordinary game state");
            var saved = original["reallife:companion"];
            gameType.GetField("SaveGameName", Any).SetValue(instance, "Renamed on save");
            gameType.GetField("buildNumberAtLastSave", Any).SetValue(instance, 9999);
            Check(saved == (string)CompanionSnapshots.RloProvider().Invoke(null, new[] { instance }),
                "Name and build finalisation after the save event do not change the report identity");
            EffectiveOptions();
            loaded.SetValue(null, false);
            copy = capture.Invoke(null, new[] { instance });
            data = (Dictionary<string, string>)modData.GetValue(copy);
            Check(data["bigcopilot:rlo-snapshot.v1"].Contains("unavailable"), "An unloaded provider never blesses old records");
            Check(data["foodtrucks:state"] == "synthetic-current", "An unavailable RLO provider leaves Street Food usable");
            loaded.SetValue(null, true);
            connected.SetValue(null, false);
            copy = capture.Invoke(null, new[] { instance });
            Check(((Dictionary<string, string>)modData.GetValue(copy))["bigcopilot:rlo-snapshot.v1"].Contains("unavailable"),
                "Disconnected wiring is unavailable");
            connected.SetValue(null, true);
            current.SetValue(null, null);
            copy = capture.Invoke(null, new[] { instance });
            Check(((Dictionary<string, string>)modData.GetValue(copy))["bigcopilot:rlo-snapshot.v1"].Contains("unavailable"),
                "A different current game cannot report freshness");
            typeof(CompanionGame).GetMethod("Save").Invoke(null, new[] { instance });
            Check(!original.ContainsKey("reallife:companion"), "An unsupported ordinary capture removes its old report");
        }
        finally
        {
            current.SetValue(null, oldCurrent);
            loaded.SetValue(null, oldLoaded);
            connected.SetValue(null, oldConnected);
            CompanionBridges.Readers.Clear();
            foreach (var pair in oldReaders) CompanionBridges.Readers.Add(pair.Key, pair.Value);
            CompanionGame.Reset();
            FoodTrucks.BigCopilotSnapshot.Expected = null;
        }
    }
    static void EffectiveOptions()
    {
        var settings = typeof(RealLifeOverhaul.Settings);
        var fields = new[] { "Economy", "EconomyCity", "EconomyCompany", "EconomyCompanyStaff", "EconomyManagers" }
            .Select(name => settings.GetField(name, Any)).ToArray();
        var old = fields.Select(f => f.GetValue(null)).ToArray();
        var links = typeof(Wiring).GetNestedType("CompanionLinks", Any);
        Func<CompanionModule> employment = () => (CompanionModule)links.GetMethod("Employment", Any).Invoke(null, null);
        Func<CompanionModule> features = () => (CompanionModule)links.GetMethod("Features", Any).Invoke(null, null);
        try
        {
            foreach (var field in fields) field.SetValue(null, true);
            fields[0].SetValue(null, false);
            Check(employment().Status == "ready", "Economy off still reports ordinary base pay");
            foreach (Dictionary<string, object> row in (object[])features().Data)
                Check(!(bool)row["enabled"] && !(bool)row["running"], "Parent off disables every economy reporting flag");
            fields[0].SetValue(null, true);
            fields[1].SetValue(null, false);
            fields[2].SetValue(null, false);
            Check(employment().Status == "ready", "Company child off does not require a running company");
            fields[2].SetValue(null, true);
            Check(employment().Status == "unavailable", "Enabled staff without its runtime is unavailable");
            fields[3].SetValue(null, false);
            Check(employment().Status == "ready", "Staff child off does not require the staff runtime");
        }
        finally
        {
            for (int i = 0; i < fields.Length; i++) fields[i].SetValue(null, old[i]);
        }
    }

}

// Mirrors Street Food's identity-sensitive API without installing or running that mod in the SDK.
namespace FoodTrucks
{
    public static class BigCopilotSnapshot
    {
        public static object Expected;
        public static int Calls;
        public static string CaptureV1(GameInstance instance)
        {
            Calls++;
            return ReferenceEquals(instance, Expected) ? "synthetic-current" : null;
        }
        public static string CaptureFactsV1(GameInstance instance)
        {
            return ReferenceEquals(instance, Expected) ? "{\"status\":\"fresh\"}" : null;
        }
    }
}
