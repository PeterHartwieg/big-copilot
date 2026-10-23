using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.Serialization;
using BigCopilotLink;
using UnityEditor;
using UnityEngine;

/// <summary>Unity SDK-only synthetic capture/ownership checks. No running game, save events, installs or external provider DLLs.</summary>
public static class BclCompatibilityTests
{
    const BindingFlags Any = BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
    static readonly Assembly Link = typeof(CompanionSnapshots).Assembly;
    static int assertions;
    static void Check(bool yes, string why) { assertions++; if (!yes) throw new Exception(why); }
    static object Call(string type, string method, params object[] values)
    { return Link.GetType("BigCopilotLink." + type).GetMethod(method, Any).Invoke(null, values); }
    static GameInstance Fixture()
    {
        var game = (GameInstance)FormatterServices.GetUninitializedObject(typeof(GameInstance));
        game.characterId = "fixture"; game.Day = 12; game.Hour = 8; game.Minute = 30.75f;
        game.modData = new Dictionary<string, string> { { "reallife:companion", "old-rlo" }, { "hartmodpack:companion", "old-hart" }, { "unrelated", "preserved" } };
        return game;
    }
    public static void Run()
    {
        try { Exercise(); Debug.Log("[BclCompatibilityTests] passed " + assertions + " assertions"); EditorApplication.Exit(0); }
        catch (Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
    }
    static void Exercise()
    {
        var game = Fixture();
        RealLifeOverhaul.Companion.Game = HARTModPack.Companion.Game = game;
        var copy = CompanionSnapshots.Capture(game);
        Check(!ReferenceEquals(copy, game) && !ReferenceEquals(copy.modData, game.modData), "Own exactly one private root and dictionary");
        Check(game.modData.Count == 3 && game.modData["reallife:companion"] == "old-rlo" && game.modData["hartmodpack:companion"] == "old-hart", "Running state untouched");
        Check(copy.modData["unrelated"] == "preserved", "Unrelated keys survive");
        Check(RealLifeOverhaul.Companion.Captures == 1 && HARTModPack.Companion.Captures == 1, "One initial invocation per provider");
        foreach (var pair in new[] { new[] { "reallife:companion", "bigcopilot:rlo-snapshot.v1" }, new[] { "hartmodpack:companion", "bigcopilot:hart-snapshot.v1" } })
        {
            var hash = (string)Call("BuildingFacts", "Hash", System.Text.Encoding.UTF8.GetBytes(copy.modData[pair[0]]));
            Check(copy.modData[pair[1]].Contains(hash), "Exact report UTF8 hash");
            Check(copy.modData[pair[0]].Contains("\"minute\":30"), "Whole copied clock");
        }
        var digest = (string)Call("CompanionSnapshots", "CurrentDigest", game);
        game.Minute = 31.25f;
        Check(copy.Minute == 30.75f, "Private clock frozen");
        Check(digest == (string)Call("CompanionSnapshots", "CurrentDigest", game), "Only captured clock excluded from module digest");
        HARTModPack.Companion.Reverse = true;
        Check(digest == (string)Call("CompanionSnapshots", "CurrentDigest", game), "Object key order canonical");
        HARTModPack.Companion.Changed = true;
        Check(digest != (string)Call("CompanionSnapshots", "CurrentDigest", game), "Midwalk module change retries publication");
        HARTModPack.Companion.Changed = false;
        HARTModPack.Companion.Failed = true;
        copy = CompanionSnapshots.Capture(game);
        Check(!copy.modData.ContainsKey("hartmodpack:companion") && copy.modData["bigcopilot:hart-snapshot.v1"].Contains("unavailable"), "Failed HART removes stale saved report");
        Check(copy.modData["bigcopilot:rlo-snapshot.v1"].Contains("fresh"), "Independent RLO status survives HART failure");
        HARTModPack.Companion.Failed = false;
        RealLifeOverhaul.Companion.BadClock = true;
        copy = CompanionSnapshots.Capture(game);
        Check(!copy.modData.ContainsKey("reallife:companion"), "Wrong clock cannot bless saved RLO");
        RealLifeOverhaul.Companion.BadClock = false;
        Ownership(game);
        ScheduleTargets();
        HireTargets();
        OtherBuilders();
        var ownedQuote = new JsonWriter();
        Call("NativeEconomyFacts", "NewLease", ownedQuote, null, null, true);
        Check(ownedQuote.ToString().Contains("owned-no-lease") && !ownedQuote.ToString().Contains("native-live-quote"), "Owned property labels zero without pretending a native quote");
        var timer = System.Diagnostics.Stopwatch.StartNew();
        HARTModPack.Companion.Items = 10000;
        copy = CompanionSnapshots.Capture(game);
        Check(copy.modData["bigcopilot:hart-snapshot.v1"].Contains("fresh"), "Bounded large catalogue captures");
        var large = (string)Call("CompanionSnapshots", "CurrentDigest", game);
        Check(large == (string)Call("CompanionSnapshots", "CurrentDigest", game), "Large canonical digest stable");
        Debug.Log("[BclCompatibilityTests] 10000 catalogue rows, capture + two digests: " + timer.ElapsedMilliseconds + " ms");
        HARTModPack.Companion.Items = 0;
        HARTModPack.Companion.Raw = "{\"schemaVersion\":1,\"schemaVersion\":1}";
        copy = CompanionSnapshots.Capture(game);
        Check(!copy.modData.ContainsKey("hartmodpack:companion"), "Duplicate report keys refused");
        HARTModPack.Companion.Raw = new string('x', 4 * 1024 * 1024 + 1);
        copy = CompanionSnapshots.Capture(game);
        Check(!copy.modData.ContainsKey("hartmodpack:companion"), "Oversize report refused");
        HARTModPack.Companion.Raw = null;
        // Distinct assembly objects exposing the same provider are ambiguous even
        // when the old provider still works. Repeated mod instances never add a type.
        Check(CompanionSnapshots.HartProvider() == CompanionSnapshots.HartProvider(), "Same assembly provider remains unambiguous");
        var assembly = AssemblyBuilder.DefineDynamicAssembly(new AssemblyName("SyntheticDuplicateHart"), AssemblyBuilderAccess.Run);
        assembly.DefineDynamicModule("main").DefineType("HARTModPack.Companion", TypeAttributes.Public).CreateType();
        copy = CompanionSnapshots.Capture(game);
        Check(CompanionSnapshots.HartProvider() == null && !copy.modData.ContainsKey("hartmodpack:companion"), "Distinct assembly ambiguity refuses both providers");
        Check(copy.modData["bigcopilot:rlo-snapshot.v1"].Contains("fresh"), "Ambiguity remains provider-local");
        Check(game.modData.Count == 3 && game.modData["hartmodpack:companion"] == "old-hart", "Failure and ambiguity never mutate saved state");
    }
    static Dictionary<string, object> ScheduleTargets()
    {
        var reg = new BuildingRegistration { StreetName = "fixture", StreetNumber = 1, scheduleDays = new List<ScheduleDay>() };
        for (var d = 0; d < 7; d++)
            reg.scheduleDays.Add(new ScheduleDay { day = (BigAmbitions.DayNightCycle.DayOfWeekOrdered)d, isOpen = d < 6,
                openingHourSlots = new List<OpeningHourSlot> { new OpeningHourSlot(8, 12), new OpeningHourSlot(15, 20) },
                workShifts = new List<WorkShift> { new WorkShift { startingHour = 8, endingHour = 12, employeeId = "moved", itemInstanceId = "station" },
                    new WorkShift { startingHour = 15, endingHour = 20, employeeId = "stays", itemInstanceId = "station2" } } });
        var target = (Dictionary<string, object>)Call("ScheduleWrite", "OwnershipCurrent", reg, new WireAddress("fixture", 1), new HashSet<string> { "moved" });
        var week = (List<object>)target["week"];
        Check(week.Count == 7, "Ownership week contains all seven days");
        var open = (Dictionary<string, object>)week[0];
        Check(((List<object>)open["hours"]).Count == 2, "Opening gaps preserved for owner proof");
        var shifts = (List<object>)open["shifts"];
        Check(shifts.Count == 1 && (string)((Dictionary<string, object>)shifts[0])["employeeId"] == "stays", "Source move projection removes only the mover");
        var closed = (Dictionary<string, object>)week[6];
        Check(!(bool)closed["isOpen"] && ((List<object>)closed["hours"]).Count == 0, "Closed day never gains open hours");
        Check(reg.scheduleDays[0].workShifts.Count == 2 && reg.scheduleDays[0].openingHourSlots.Count == 2, "Target projection leaves live week untouched");
        return target;
    }

    static Dictionary<string, object>[] HireTargets()
    {
        var hireType = typeof(HireWrite).GetNestedType("Hired", Any);
        var moveType = typeof(HireWrite).GetNestedType("Moved", Any);
        var siteType = typeof(HireWrite).GetNestedType("SiteState", Any);
        var hired = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(hireType));
        var moved = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(moveType));
        var sites = Activator.CreateInstance(typeof(List<>).MakeGenericType(siteType));
        var candidate = (Entities.EmployeeInstance)FormatterServices.GetUninitializedObject(typeof(Entities.EmployeeInstance));
        candidate.assignedAddress = new Address("prior", 2);
        var hire = Activator.CreateInstance(hireType);
        hireType.GetField("Req", Any).SetValue(hire, new HireWrite.HireReq { Address = new WireAddress("target", 1) });
        hireType.GetField("Candidate", Any).SetValue(hire, candidate);
        hired.Add(hire);
        var move = Activator.CreateInstance(moveType);
        moveType.GetField("Req", Any).SetValue(move, new HireWrite.MoveReq { HasFrom = true,
            From = new WireAddress("missing-source", 3), To = new WireAddress("target", 1) });
        moved.Add(move);
        var rows = ((IEnumerable<Dictionary<string, object>>)Call("HireWrite", "OwnershipTargets", hired, moved, sites)).ToArray();
        Check(rows.Length == 3 && rows.Any(row => (string)row["street"] == "prior"), "Hire queries pre-existing candidate assignment too");
        Check(rows.Any(row => (string)row["street"] == "missing-source"), "Unregistered move source cannot escape owner query");
        Check(rows.Single(row => (string)row["street"] == "target")["hiring"].Equals(true)
            && rows.Single(row => (string)row["street"] == "target")["moving"].Equals(true), "Shared destination merges hire/move flags");
        return rows;
    }

    static void Ownership(GameInstance game)
    {
        var target = new Dictionary<string, object> { { "street", "fixture" }, { "number", 1 } };
        var schedule=ScheduleTargets();
        var hire=HireTargets();
        Dictionary<string,object>[] targets;
        foreach (var operation in new[] { "schedule", "hire", "wholesale", "rent" })
        foreach (var phase in new[] { "review", "apply", "undo" })
        {
            targets=operation=="schedule" ? new[]{schedule} : operation=="hire" ? hire : operation=="rent" ? new[]{target}
                : new[]{new Dictionary<string,object>{{"street","fixture"},{"number",1},{"contractId","fixture|supplier"},{"action","set"},{"itemIds",new[]{"item"}}}};
            RealLifeOverhaul.Companion.Decision = "allowed";
            Check(Call("ModOwnership", "Check", operation, phase, targets) == null, "Fresh allowed query passes");
            var request = JsonReader.Obj(JsonReader.Parse(RealLifeOverhaul.Companion.Request), "request");
            Check((string)request["phase"] == phase && (string)request["operation"] == operation, "Actual mutation phase forwarded");
            RealLifeOverhaul.Companion.Decision = "conditional";
            var answer = (WriteAnswer)Call("ModOwnership", "Check", operation, phase, targets);
            Check(answer.Status == 409 && answer.Json.Contains("mod_owned") && answer.Json.Contains("manager-rewrite"), "Conditional is semantic refusal with effects");
            RealLifeOverhaul.Companion.Decision = "unknown";
            answer = (WriteAnswer)Call("ModOwnership", "Check", operation, phase, targets);
            Check(answer.Status == 409 && answer.Json.Contains("ownership_unknown"), "Unknown never authorizes writes or undo");
        }
        var incomplete = ScheduleTargets();
        ((List<object>)incomplete["week"]).RemoveAt(6);
        RealLifeOverhaul.Companion.Request = "unchanged";
        foreach(var phase in new[]{"review","apply","undo"})
            Check(((WriteAnswer)Call("ModOwnership","Check","schedule",phase,new[]{incomplete})).Json.Contains("ownership-week-incomplete"), "Incomplete native week refuses before provider query");
        Check(RealLifeOverhaul.Companion.Request=="unchanged", "Malformed week never reaches owner API");
        targets=new[]{schedule};
        RealLifeOverhaul.Companion.Decision = "allowed";
        RealLifeOverhaul.Companion.BadDecision = true;
        Check(((WriteAnswer)Call("ModOwnership", "Check", "schedule", "apply", targets)).Json.Contains("ownership_unknown"), "Malformed allowed response refuses");
        RealLifeOverhaul.Companion.BadDecision = false;
        RealLifeOverhaul.Companion.Enabled = false;
        Check(Call("ModOwnership", "Legacy", game, "schedule", targets) == null, "Fresh old managers disabled plus daytime week permits schedule");
        var day=(Dictionary<string,object>)((List<object>)schedule["week"])[0];
        day["hours"]=new List<object>{new Dictionary<string,object>{{"from",0},{"to",24}}};
        Check(((WriteAnswer)Call("ModOwnership","Legacy",game,"schedule",targets)).Json.Contains("legacy-late-opening-permit-unverified"),"Old managers off cannot authorize late hours with company on");
        RealLifeOverhaul.Companion.CompanyEnabled=false;
        Check(Call("ModOwnership","Legacy",game,"schedule",targets)==null,"Fresh company disabled proves no permit restriction");
        RealLifeOverhaul.Companion.CompanyEnabled=true;
        var scheduledHire=new Dictionary<string,object>(schedule){{"hiring",false},{"moving",false},{"scheduling",true}};
        Check(((WriteAnswer)Call("ModOwnership","Legacy",game,"hire",new[]{scheduledHire})).Json.Contains("ownership_unknown"),"Hire scheduling also needs late permit proof");
        Check(Call("ModOwnership","Legacy",game,"hire",hire)==null,"Hire without hours change needs no late opening proof");
        targets=new[]{ScheduleTargets()};
        RealLifeOverhaul.Companion.Enabled = true;
        Check(((WriteAnswer)Call("ModOwnership", "Legacy", game, "schedule", targets)).Json.Contains("ownership_unknown"), "enabled true running false cannot authorize");
        Check(((WriteAnswer)Call("ModOwnership", "Legacy", game, "rent", new[]{target})).Json.Contains("ownership_unknown"), "Missing legacy estate proof refuses rent");
        RealLifeOverhaul.Companion.Failed = true;
        Check(((WriteAnswer)Call("ModOwnership", "Legacy", game, "hire", hire)).Json.Contains("ownership_unknown"), "Stale saved report cannot authorize old hire");
        RealLifeOverhaul.Companion.Failed = false;
    }
    static void OtherBuilders()
    {
        var rejected=false;
        try { OwnershipSchemaCheck.Request("{\"schemaVersion\":1,\"operation\":\"rent\",\"phase\":\"apply\",\"targets\":[{\"street\":\"fixture\",\"number\":1,\"pendingPricePerSqm\":2}]}"); }
        catch(Exception) { rejected=true; }
        Check(rejected,"Strict schema rejects extraneous rent fields");
        RealLifeOverhaul.Companion.Decision="allowed";
        var rowType=typeof(RentWrite).GetNestedType("Row",Any);
        var rows=(System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(rowType));
        var row=Activator.CreateInstance(rowType);
        rowType.GetField("Address",Any).SetValue(row,new WireAddress("fixture",1)); rows.Add(row);
        foreach(var phase in new[]{"review","apply","undo"})
            Check(Call("RentWrite","Ownership",rows,phase)==null,"Actual rent builder follows strict request schema");
        var planType=typeof(WholesaleWrite).GetNestedType("Plan",Any);
        var plan=Activator.CreateInstance(planType);
        planType.GetField("Request",Any).SetValue(plan,new WholesaleWrite.Request{Address=new WireAddress("fixture",1),Supplier=new WireAddress("supplier",2)});
        foreach(var phase in new[]{"review","apply","undo"})
            Check(Call("WholesaleWrite","Ownership",plan,phase)==null,"Actual wholesale remove builder follows strict request schema");
        var contract=new Entities.DeliveryContract { items=new List<Entities.DeliveryContractItem> { new Entities.DeliveryContractItem { itemName="fixture-item",amount=1 } } };
        planType.GetField("After",Any).SetValue(plan,contract);
        Check(Call("WholesaleWrite","Ownership",plan,"apply")==null,"Actual wholesale set builder follows strict request schema");
    }

    public static string Report(GameInstance game, string provider, string modules, bool badClock = false, bool reverse = false)
    {
        var clock = "\"captured\":{\"character\":\"" + game.characterId + "\",\"day\":" + game.Day + ",\"hour\":" + game.Hour + ",\"minute\":" + (badClock ? 1 : (int)game.Minute) + "}";
        var identity = "\"schemaVersion\":1,\"provider\":\"" + provider + "\",\"modVersion\":\"test\"";
        return reverse ? "{" + clock + ",\"modules\":" + modules + "," + identity + "}" : "{" + identity + "," + clock + ",\"modules\":" + modules + "}";
    }
}
namespace RealLifeOverhaul
{
    public static class Companion
    {
        public static GameInstance Game;
        public static int Captures;
        public static bool BadClock, Failed, Enabled, BadDecision;
        public static bool CompanyEnabled=true;
        public static string Decision, Request;
        public static string CaptureV1(GameInstance game)
        {
            Captures++;
            if (Failed || !ReferenceEquals(Game, game)) return null;
            return BclCompatibilityTests.Report(game, "rlo", "{\"features\":{\"version\":1,\"status\":\"ready\",\"data\":[{\"id\":\"managers\",\"enabled\":" + (Enabled ? "true" : "false") + ",\"running\":false},{\"id\":\"company\",\"enabled\":"+(CompanyEnabled ? "true":"false")+"}]}}", BadClock);
        }
        public static string OwnershipV1(GameInstance game, string request)
        {
            OwnershipSchemaCheck.Request(request);
            Request = request;
            return BadDecision ? "{\"schemaVersion\":1,\"decision\":\"allowed\"}" : "{\"schemaVersion\":1,\"decision\":\"" + Decision + "\",\"owner\":\"rlo\",\"task\":\"rota\",\"reasons\":[\"manager-task\"],\"effects\":[\"manager-rewrite\"]}";
        }
    }
}
namespace HARTModPack
{
    public static class Companion
    {
        public static GameInstance Game;
        public static int Captures;
        public static bool Failed, Changed, Reverse;
        public static int Items;
        public static string Raw;
        public static string CaptureV1(GameInstance game)
        {
            Captures++;
            if (Failed || !ReferenceEquals(Game, game)) return null;
            if (Raw != null) return Raw;
            if (Items > 0)
                return BclCompatibilityTests.Report(game, "hart-mod-pack", "{\"runningCosts\":{\"version\":1,\"status\":\"ready\",\"data\":{\"items\":[" + string.Join(",", Enumerable.Range(0, Items).Select(i => "{\"itemId\":\"item" + i + "\",\"openWatts\":123,\"alwaysWatts\":4,\"litresPerOpenHour\":5,\"officeSeat\":false}")) + "]}}}");
            return BclCompatibilityTests.Report(game, "hart-mod-pack", "{\"runtime\":{\"version\":1,\"status\":\"ready\",\"data\":{\"gameplayActive\":" + (Changed ? "false" : "true") + "}}}", false, Reverse);
        }
    }
}
