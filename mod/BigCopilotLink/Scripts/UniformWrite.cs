using System;
using System.Collections.Generic;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/uniforms: a preset on every skill of a site's Uniforms window that has
    /// none yet (docs/mod-write-back-scope.md section 3). The game's own path is
    /// SetUpUniformsWindow.OnUniformDropdownOptionSelected (build 3680 IL):
    /// uniformsBySkill[skill] = preset.id, CustomerDemandHelper.ReloadCachedFulfilled,
    /// BuildingManager.onUniformChanged.Invoke(skill, id), GameEvent
    /// "ba:gameevent_employeeuniformassigned". The mod makes the same calls. A skill that
    /// already has a uniform is never touched: "has none yet" is the compare-and-set.
    /// </summary>
    public static class UniformWrite
    {
        private const string EmptyBusinessType = "ba:businesstype_empty";
        private const string UniformAssignedEvent = "ba:gameevent_employeeuniformassigned";

        public sealed class Request
        {
            public readonly List<Site> Sites = new List<Site>();
        }

        public sealed class Site
        {
            public WireAddress Address;
            /// <summary>Null: every skill the site's Uniforms window offers.</summary>
            public List<string> Skills;
            public string PresetId;
        }

        /// <summary>What one write set: undo clears exactly these, where they still hold its preset.</summary>
        public sealed class UndoState
        {
            public readonly List<Entry> Entries = new List<Entry>();
        }

        public sealed class Entry
        {
            public WireAddress Address;
            public string Skill;
            public string PresetId;
            // A skill with no uniform is either no key or a key with an empty id (the
            // window shows both as unassigned); undo puts back whichever it was.
            public bool HadKey;
            public string OldValue;
        }

        private sealed class Row
        {
            public WireAddress Address;
            public BuildingRegistration Registration;
            public string Business;
            public EmployeePreset Preset;
            public readonly List<string> Set = new List<string>();
            public readonly List<KeyValuePair<string, string>> Skipped = new List<KeyValuePair<string, string>>();
            public string Error;
        }

        // ---- HTTP thread -----------------------------------------------------------

        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request();
            // One row per site: two rows for one site would each plan against the state
            // before either applied, and the second's undo entry would record the first
            // row's preset as the old value.
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var sites = JsonReader.Arr(JsonReader.Get(root, "sites"), "body.sites");
            for (var i = 0; i < sites.Count; i++)
            {
                var path = "body.sites[" + i + "]";
                var obj = JsonReader.Obj(sites[i], path);
                var site = new Site
                {
                    Address = WriteService.ParseAddress(obj, "address", path),
                    PresetId = JsonReader.Str(obj, "presetId", path, false)
                };
                var given = JsonReader.Get(obj, "skills");
                if (given != null)
                {
                    site.Skills = new List<string>();
                    var skills = JsonReader.Arr(given, path + ".skills");
                    for (var j = 0; j < skills.Count; j++)
                    {
                        var skill = skills[j] as string;
                        if (string.IsNullOrEmpty(skill)) throw new BadRequestException(path + ".skills[" + j + "] must be a skill id");
                        if (!site.Skills.Contains(skill)) site.Skills.Add(skill);
                    }
                }
                if (!seen.Add(site.Address.Street + "|" + site.Address.Number))
                    throw new BadRequestException(path + ".address repeats a site");
                req.Sites.Add(site);
            }
            return req;
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var presets = SaveGameManager.Current.employeePresets ?? new List<EmployeePreset>();
            var rows = new List<Row>();
            var failed = false;

            foreach (var site in req.Sites)
            {
                var row = new Row { Address = site.Address };
                rows.Add(row);
                row.Error = CheckSite(row, presets, site.PresetId);
                if (row.Error != null)
                {
                    failed = true;
                    continue;
                }

                var offered = OfferedSkills(row.Registration);
                foreach (var skill in site.Skills ?? offered)
                {
                    if (!offered.Contains(skill)) row.Skipped.Add(new KeyValuePair<string, string>(skill, "not_offered"));
                    else if (HasUniform(row.Registration, skill)) row.Skipped.Add(new KeyValuePair<string, string>(skill, "already_set"));
                    else row.Set.Add(skill);
                }
            }

            if (dryRun || failed) return Answer(rows, presets, dryRun, failed, false, null);

            var undo = new UndoState();
            var applied = new List<Row>();
            foreach (var row in rows)
            {
                if (row.Set.Count == 0) continue;
                foreach (var skill in row.Set)
                {
                    var entry = new Entry { Address = row.Address, Skill = skill, PresetId = row.Preset.id };
                    var map = row.Registration.uniformsBySkill;
                    entry.HadKey = map != null && map.TryGetValue(skill, out entry.OldValue);
                    undo.Entries.Add(entry);
                    Assign(row.Registration, skill, row.Preset.id);
                }
                AfterChange(row.Registration, row.Set, row.Preset.id);
                applied.Add(row);
            }
            // The last write of the kind is what undo restores, even one that set nothing.
            ws.UniformUndo = undo.Entries.Count > 0 ? undo : null;

            string stamp;
            if (applied.Count > 0)
            {
                var business = applied.Count == 1 ? applied[0].Business : WriteService.Count(applied.Count, "business", "businesses");
                stamp = ws.Applied("bigcopilotlink_notify_uniforms", business);
            }
            else stamp = ws.RefreshAfterWrite();
            return Answer(rows, presets, false, false, false, stamp);
        }

        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var presets = SaveGameManager.Current.employeePresets ?? new List<EmployeePreset>();
            var rows = new List<Row>();
            var byAddress = new Dictionary<string, Row>();
            var changed = false;

            foreach (var entry in state.Entries)
            {
                var key = entry.Address.Street + "|" + entry.Address.Number;
                Row row;
                if (!byAddress.TryGetValue(key, out row))
                {
                    row = new Row { Address = entry.Address, Registration = WriteService.FindRegistration(entry.Address) };
                    if (row.Registration != null) row.Business = row.Registration.BusinessName;
                    row.Preset = presets.Find(p => p != null && p.id == entry.PresetId);
                    byAddress[key] = row;
                    rows.Add(row);
                }

                string current = null;
                if (row.Registration != null && row.Registration.uniformsBySkill != null)
                    row.Registration.uniformsBySkill.TryGetValue(entry.Skill, out current);
                if (row.Registration == null || current != entry.PresetId)
                {
                    // The player (or the game) dressed this skill since: undo would now
                    // overwrite their choice, which a write never does.
                    row.Error = "changed";
                    changed = true;
                    continue;
                }
                row.Set.Add(entry.Skill);
            }

            if (dryRun || changed) return Answer(rows, presets, dryRun, changed, true, null);

            foreach (var row in rows)
            {
                // Newest first, so a skill recorded twice ends at its oldest value.
                for (var i = state.Entries.Count - 1; i >= 0; i--)
                {
                    var entry = state.Entries[i];
                    if (!entry.Address.Is(row.Address.Street, row.Address.Number)) continue;
                    Restore(row.Registration, entry);
                    AfterChange(row.Registration, new List<string> { entry.Skill }, entry.HadKey ? entry.OldValue : null);
                }
            }
            ws.UniformUndo = null;

            var business = rows.Count == 1 ? rows[0].Business : WriteService.Count(rows.Count, "business", "businesses");
            var stamp = ws.Applied("bigcopilotlink_notify_undo_uniforms", business);
            return Answer(rows, presets, false, false, true, stamp);
        }

        /// <summary>The site rules, in the contract's order; sets Registration and Preset on the way.</summary>
        private static string CheckSite(Row row, List<EmployeePreset> presets, string presetId)
        {
            var reg = WriteService.FindRegistration(row.Address);
            if (reg == null) return "not_found";
            row.Registration = reg;
            row.Business = reg.BusinessName;
            if (!reg.RentedByPlayer) return "not_rented";
            // UniformLockerController.CanAssignUniforms: a player business, not the empty type.
            if (string.IsNullOrEmpty(reg.businessTypeName) || reg.businessTypeName == EmptyBusinessType) return "no_business";
            if (!HasLocker(reg)) return "no_locker";
            row.Preset = ResolvePreset(presets, presetId);
            if (row.Preset == null) return "no_preset";
            return null;
        }

        /// <summary>null asks for the preset named "Default", else the first there is.</summary>
        private static EmployeePreset ResolvePreset(List<EmployeePreset> presets, string presetId)
        {
            if (presetId != null) return presets.Find(p => p != null && p.id == presetId);
            var byName = presets.Find(p => p != null && p.name == "Default");
            return byName ?? presets.Find(p => p != null);
        }

        /// <summary>SetUpUniformsWindow.ShouldShowWindow: an item tagged isuniformlocker in the building.</summary>
        private static bool HasLocker(BuildingRegistration reg)
        {
            if (reg.itemInstances == null) return false;
            var tag = BigAmbitions.Tags.TagRef.Itemtag.isuniformlocker;
            foreach (var instance in reg.itemInstances.Values)
            {
                if (instance == null || string.IsNullOrEmpty(instance.itemName)) continue;
                var item = BigAmbitions.Items.ItemsGetter.GetByName(instance.itemName, true);
                if (item != null && item.HasTag(tag)) return true;
            }
            return false;
        }

        /// <summary>
        /// SetUpUniformsWindow.SetSkillNameDropdownOptions: the business type's
        /// employeePrimarySkills, then the building type's requiredBuildingSkills.
        /// </summary>
        private static List<string> OfferedSkills(BuildingRegistration reg)
        {
            var skills = new List<string>();
            var business = Helpers.BusinessTypeHelper.GetData(reg);
            if (business != null && business.employeePrimarySkills != null)
                foreach (var s in business.employeePrimarySkills)
                    if (!string.IsNullOrEmpty(s) && !skills.Contains(s)) skills.Add(s);
            var building = Buildings.BuildingTypeHelper.GetData(reg);
            if (building != null && building.requiredBuildingSkills != null)
                foreach (var s in building.requiredBuildingSkills)
                    if (!string.IsNullOrEmpty(s) && !skills.Contains(s)) skills.Add(s);
            return skills;
        }

        /// <summary>The window shows "unassigned" for a missing key and for an id no preset has.</summary>
        private static bool HasUniform(BuildingRegistration reg, string skill)
        {
            string id;
            return reg.uniformsBySkill != null && reg.uniformsBySkill.TryGetValue(skill, out id) && !string.IsNullOrEmpty(id);
        }

        private static void Assign(BuildingRegistration reg, string skill, string presetId)
        {
            if (reg.uniformsBySkill == null) reg.uniformsBySkill = new Dictionary<string, string>();
            reg.uniformsBySkill[skill] = presetId;
        }

        private static void Restore(BuildingRegistration reg, Entry entry)
        {
            if (entry.HadKey)
            {
                if (reg.uniformsBySkill == null) reg.uniformsBySkill = new Dictionary<string, string>();
                reg.uniformsBySkill[entry.Skill] = entry.OldValue;
            }
            else if (reg.uniformsBySkill != null) reg.uniformsBySkill.Remove(entry.Skill);
        }

        /// <summary>
        /// The game's calls after a uniform changes, as OnUniformDropdownOptionSelected
        /// makes them (the "unassigned" choice passes a null id the same way). The reload
        /// clears the "No staff uniforms set" warning now instead of at midnight;
        /// onUniformChanged re-dresses staff standing at a station in the loaded building
        /// (EmployeeStationController.OnUniformChanged, which only acts where its own
        /// station's preset for that skill matches the id). Each call is guarded: the
        /// uniform is already set, and one failing must not stop the others.
        /// </summary>
        private static void AfterChange(BuildingRegistration reg, List<string> skills, string presetId)
        {
            try
            {
                Entities.CustomerDemandHelper.ReloadCachedFulfilled(reg);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("ReloadCachedFulfilled after a uniform write failed: " + e.Message);
            }

            var manager = global::BuildingManager.Instance;
            foreach (var skill in skills)
            {
                try
                {
                    if (manager != null && manager.onUniformChanged != null) manager.onUniformChanged.Invoke(skill, presetId);
                    global::GameEvent.Invoke(UniformAssignedEvent);
                }
                catch (Exception e)
                {
                    LinkMod.LogWarn("the uniform-changed event failed: " + e.Message);
                }
            }
        }

        private static WriteAnswer Answer(List<Row> rows, List<EmployeePreset> presets, bool dryRun, bool failed, bool undo, string stamp)
        {
            var anyChanged = rows.Exists(r => r.Error == "changed");
            var w = new JsonWriter();
            w.BeginObject();
            var status = 200;
            if (failed && !dryRun)
            {
                status = 409;
                w.Prop("error", anyChanged ? "changed" : "refused");
            }
            w.Prop("ok", !failed);
            w.Prop("kind", "uniforms");
            w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);

            w.BeginArray("presets");
            foreach (var p in presets)
            {
                if (p == null) continue;
                w.BeginObject();
                w.Prop("id", p.id);
                w.Prop("name", p.name);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("rows");
            foreach (var row in rows)
            {
                w.BeginObject();
                WriteService.WriteAddress(w, "address", row.Address.Street, row.Address.Number);
                w.Prop("business", row.Business);
                w.Prop("presetId", row.Preset != null ? row.Preset.id : null);
                w.Prop("presetName", row.Preset != null ? row.Preset.name : null);
                w.BeginArray("set");
                foreach (var s in row.Set) w.Value(s);
                w.EndArray();
                w.BeginArray("skipped");
                foreach (var s in row.Skipped)
                {
                    w.BeginObject();
                    w.Prop("skill", s.Key);
                    w.Prop("reason", s.Value);
                    w.EndObject();
                }
                w.EndArray();
                w.Prop("error", row.Error);
                w.EndObject();
            }
            w.EndArray();
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }
    }
}
