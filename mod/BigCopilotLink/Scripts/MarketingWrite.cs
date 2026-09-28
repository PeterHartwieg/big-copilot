using System;
using System.Collections.Generic;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/marketing (from 0.4.0): the marketing campaigns each site runs, and
    /// the set-up that makes BizMan's Marketing page show every switch for it
    /// (docs/marketing-write-scope.md). The game's own paths, from build 3680 IL:
    /// BizManMarketing.UpdateCampaignEnabled toggles `enabled` on the site's campaign
    /// for (agency, type), adding it when missing, then BusinessHelper.UpdatePromotion;
    /// MarketingAgencyDialog.OnMarketingSettingsSet does the same in person, fires
    /// "ba:gameevent_newmarketing", and removes unticked types (the write never
    /// removes: it disables, as the phone does, so undo stays exact). BizMan draws a
    /// block of switches only for agencies the site has an entry with, and only for a
    /// phone contact; the contact is BuildingRegistration.GetOrAddBusinessContact on
    /// the agency, the call SpecialEmployeeController makes when the player talks to
    /// its employee. So every write gives the site an entry for every type an agency
    /// sells (the unused ones disabled, which costs nothing: MarketingHelper.RunDaily,
    /// GetMarketingEfficiency and GetDailyMarketingExpenses all count enabled ones
    /// only) and makes each agency it names a contact.
    /// </summary>
    public static class MarketingWrite
    {
        private const string EmptyBusinessType = "ba:businesstype_empty";
        private const string NewMarketingEvent = "ba:gameevent_newmarketing";

        /// <summary>Entities.MarketingTypeName by id, as the wire names them (None, 6, is never sent).</summary>
        internal static readonly string[] TypeNames =
        {
            "SmallInternet", "MediumInternet", "LargeInternet", "SmallBillboard", "MediumBillboard", "LargeBillboard"
        };

        public sealed class Request
        {
            public readonly List<Site> Sites = new List<Site>();
            /// <summary>body.expect.character and .company, as for uniforms; null: not checked.</summary>
            public string ExpectCharacter;
            public string ExpectCompany;
        }

        public sealed class Site
        {
            public WireAddress Address;
            public readonly HashSet<int> On = new HashSet<int>();
            public readonly HashSet<int> Was = new HashSet<int>();
        }

        /// <summary>What one write switched: undo puts each flag back where it still holds what the write left.</summary>
        public sealed class UndoState
        {
            public readonly List<Flip> Flips = new List<Flip>();
        }

        public sealed class Flip
        {
            public WireAddress Site;
            public WireAddress Agency;
            public int Type;
            public bool Before;
            public bool After;
        }

        /// <summary>An agency in the city: its building and what it sells.</summary>
        private sealed class Agency
        {
            public Buildings.Building Building;
            public WireAddress Address;
            public List<int> Types;
        }

        /// <summary>One campaign entry of a site as the write leaves it.</summary>
        private sealed class Entry
        {
            public Entities.MarketingCampaign Campaign; // null: the write adds it
            public WireAddress Agency;
            public int Type;
            public bool Was;
            public bool Now;
        }

        private sealed class Row
        {
            public WireAddress Address;
            public BuildingRegistration Registration;
            public string Business;
            public string Error;
            public readonly List<Entry> Entries = new List<Entry>();
            public readonly List<int> Added = new List<int>();
            // Before: what the game holds.
            public List<int> BeforeOn = new List<int>();
            public float BeforeCost;
            public int[] BeforePromotion;
            // After: what the game will hold (a dry run: the mod's reckoning).
            public float AfterCost;
            public int[] AfterPromotion;
        }

        // ---- HTTP thread -----------------------------------------------------------

        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request();
            var expect = JsonReader.Get(root, "expect");
            if (expect != null)
            {
                var guard = JsonReader.Obj(expect, "body.expect");
                req.ExpectCharacter = JsonReader.Str(guard, "character", "body.expect", false);
                req.ExpectCompany = JsonReader.Str(guard, "company", "body.expect", false);
            }
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var sites = JsonReader.Arr(JsonReader.Get(root, "sites"), "body.sites");
            for (var i = 0; i < sites.Count; i++)
            {
                var path = "body.sites[" + i + "]";
                var obj = JsonReader.Obj(sites[i], path);
                var site = new Site { Address = WriteService.ParseAddress(obj, "address", path) };
                ParseTypes(obj, "on", path, site.On);
                ParseTypes(obj, "was", path, site.Was);
                if (!seen.Add(site.Address.Street + "|" + site.Address.Number))
                    throw new BadRequestException(path + ".address repeats a site");
                req.Sites.Add(site);
            }
            return req;
        }

        private static void ParseTypes(Dictionary<string, object> obj, string key, string path, HashSet<int> into)
        {
            var list = JsonReader.Arr(JsonReader.Get(obj, key), path + "." + key);
            for (var j = 0; j < list.Count; j++)
            {
                var name = list[j] as string;
                var id = name == null ? -1 : Array.IndexOf(TypeNames, name);
                if (id < 0) throw new BadRequestException(path + "." + key + "[" + j + "] must be a marketing type name");
                into.Add(id);
            }
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var game = SaveGameManager.Current;
            var otherSave =
                (req.ExpectCharacter != null && !string.Equals(req.ExpectCharacter, game.characterId ?? "", StringComparison.Ordinal)) ||
                (req.ExpectCompany != null && !string.Equals(req.ExpectCompany, game.SaveGameName ?? "", StringComparison.Ordinal));
            var agencies = Agencies();
            var rows = new List<Row>();
            var failed = false;

            foreach (var site in req.Sites)
            {
                var row = new Row { Address = site.Address };
                rows.Add(row);
                if (otherSave)
                {
                    row.Error = "changed";
                    failed = true;
                    continue;
                }
                row.Error = CheckSite(row, site, agencies);
                if (row.Error != null)
                {
                    failed = true;
                    continue;
                }
                Plan(row, site.On, agencies);
            }

            // The agencies the call makes phone contacts, once each.
            var contacts = new List<Agency>();
            foreach (var row in rows)
            {
                if (row.Error != null) continue;
                foreach (var e in row.Entries)
                {
                    var agency = agencies.Find(a => a.Address.Is(e.Agency.Street, e.Agency.Number));
                    if (agency != null && !contacts.Contains(agency) && !IsContact(agency)) contacts.Add(agency);
                }
            }

            if (dryRun || failed) return Answer(rows, contacts, dryRun, failed, false, null);

            var undo = new UndoState();
            var turnedOn = false;
            var touched = new List<Row>();
            foreach (var row in rows)
            {
                var reg = row.Registration;
                if (reg.marketingCampaigns == null) reg.marketingCampaigns = new List<Entities.MarketingCampaign>();
                var changed = row.Added.Count > 0;
                foreach (var e in row.Entries)
                {
                    if (e.Campaign == null)
                    {
                        e.Campaign = new Entities.MarketingCampaign
                        {
                            agencyAddress = new Address(e.Agency.Street, e.Agency.Number),
                            marketingTypeName = (Entities.MarketingTypeName)e.Type,
                            enabled = e.Now
                        };
                        reg.marketingCampaigns.Add(e.Campaign);
                    }
                    else e.Campaign.enabled = e.Now;
                    if (e.Was == e.Now) continue;
                    changed = true;
                    if (e.Now) turnedOn = true;
                    undo.Flips.Add(new Flip { Site = row.Address, Agency = e.Agency, Type = e.Type, Before = e.Was, After = e.Now });
                }
                AfterChange(row);
                if (changed) touched.Add(row);
            }
            foreach (var agency in contacts) AddContact(agency);
            if (turnedOn) Fire(NewMarketingEvent);
            // The last write of the kind is what undo restores, even one that switched nothing.
            ws.MarketingUndo = undo.Flips.Count > 0 ? undo : null;

            string stamp;
            if (touched.Count > 0 || contacts.Count > 0)
            {
                var named = touched.Count > 0 ? touched : rows;
                var business = named.Count == 1 ? named[0].Business : WriteService.Count(named.Count, "business", "businesses");
                stamp = ws.Applied("bigcopilotlink_notify_marketing", business);
            }
            else stamp = ws.RefreshAfterWrite();
            return Answer(rows, contacts, false, false, false, stamp);
        }

        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var rows = new List<Row>();
            var changed = false;
            foreach (var flip in state.Flips)
            {
                var row = rows.Find(r => r.Address.Is(flip.Site.Street, flip.Site.Number));
                if (row == null)
                {
                    row = new Row { Address = flip.Site, Registration = WriteService.FindRegistration(flip.Site) };
                    rows.Add(row);
                    if (row.Registration == null)
                    {
                        row.Error = "changed";
                        changed = true;
                        continue;
                    }
                    row.Business = row.Registration.BusinessName;
                    ReadBefore(row);
                    // Every campaign as it is; the flips below set what undo puts back.
                    foreach (var c in Campaigns(row.Registration))
                        row.Entries.Add(new Entry { Campaign = c, Agency = Wire(c.agencyAddress), Type = (int)c.marketingTypeName, Was = c.enabled, Now = c.enabled });
                }
                if (row.Error != null) continue;
                var entry = row.Entries.Find(e => e.Type == flip.Type && e.Agency.Is(flip.Agency.Street, flip.Agency.Number));
                if (entry == null || entry.Was != flip.After)
                {
                    // Switched by hand since (or gone): undo would overwrite the player's choice.
                    row.Error = "changed";
                    changed = true;
                    continue;
                }
                entry.Now = flip.Before;
            }
            foreach (var row in rows)
            {
                if (row.Error != null) continue;
                row.AfterCost = Cost(row.Entries);
                row.AfterPromotion = Predict(row.Registration, Running(row.Entries));
            }

            if (dryRun || changed) return Answer(rows, new List<Agency>(), dryRun, changed, true, null);

            foreach (var row in rows)
            {
                foreach (var e in row.Entries) e.Campaign.enabled = e.Now;
                AfterChange(row);
            }
            ws.MarketingUndo = null;

            var business = rows.Count == 1 ? rows[0].Business : WriteService.Count(rows.Count, "business", "businesses");
            var stamp = ws.Applied("bigcopilotlink_notify_undo_marketing", business);
            return Answer(rows, new List<Agency>(), false, false, true, stamp);
        }

        /// <summary>The site rules, in the contract's order; sets Registration and the before state on the way.</summary>
        private static string CheckSite(Row row, Site site, List<Agency> agencies)
        {
            var reg = WriteService.FindRegistration(row.Address);
            if (reg == null) return "not_found";
            row.Registration = reg;
            row.Business = reg.BusinessName;
            ReadBefore(row);
            var running = new HashSet<int>(row.BeforeOn);
            if (!running.SetEquals(site.Was)) return "changed";
            if (!reg.RentedByPlayer) return "not_rented";
            if (string.IsNullOrEmpty(reg.BusinessName) || string.IsNullOrEmpty(reg.businessTypeName) || reg.businessTypeName == EmptyBusinessType)
                return "no_business";
            if (!HasPromotion(reg)) return "no_promotion";
            foreach (var type in site.On)
                if (AgencyFor(agencies, type) == null) return "no_agency";
            return null;
        }

        /// <summary>
        /// The set-up and the switches: for every type an agency sells, an entry (the one
        /// the site has, the enabled one first, else a new one at the first agency that
        /// sells it), on when the type is in `on`; every other entry of that type off.
        /// </summary>
        private static void Plan(Row row, HashSet<int> on, List<Agency> agencies)
        {
            var existing = Campaigns(row.Registration);
            for (var type = 0; type < TypeNames.Length; type++)
            {
                var mine = existing.FindAll(c => (int)c.marketingTypeName == type);
                if (mine.Count == 0)
                {
                    var agency = AgencyFor(agencies, type);
                    if (agency == null) continue; // nobody sells it, and it is not asked for (checked)
                    row.Entries.Add(new Entry { Agency = agency.Address, Type = type, Was = false, Now = on.Contains(type) });
                    row.Added.Add(type);
                    continue;
                }
                var keep = mine.Find(c => c.enabled) ?? mine[0];
                foreach (var c in mine)
                    row.Entries.Add(new Entry { Campaign = c, Agency = Wire(c.agencyAddress), Type = type, Was = c.enabled, Now = c == keep && on.Contains(type) });
            }
            // A campaign of a type the enum has beyond the six (None) is left as it is.
            foreach (var c in existing)
            {
                var t = (int)c.marketingTypeName;
                if (t < 0 || t >= TypeNames.Length)
                    row.Entries.Add(new Entry { Campaign = c, Agency = Wire(c.agencyAddress), Type = t, Was = c.enabled, Now = c.enabled });
            }
            row.AfterCost = Cost(row.Entries);
            row.AfterPromotion = Predict(row.Registration, Running(row.Entries));
        }

        private static List<Entities.MarketingCampaign> Campaigns(BuildingRegistration reg)
        {
            var list = new List<Entities.MarketingCampaign>();
            if (reg.marketingCampaigns == null) return list;
            foreach (var c in reg.marketingCampaigns) if (c != null) list.Add(c);
            return list;
        }

        private static void ReadBefore(Row row)
        {
            var running = new SortedSet<int>();
            foreach (var c in Campaigns(row.Registration))
                if (c.enabled) running.Add((int)c.marketingTypeName);
            row.BeforeOn = new List<int>(running);
            try
            {
                row.BeforeCost = row.Registration.GetDailyMarketingExpenses();
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("GetDailyMarketingExpenses failed: " + e.Message);
            }
            row.BeforePromotion = Snapshot(row.Registration.promotion);
        }

        private static int[] Snapshot(Promotion promotion)
        {
            return promotion == null ? null : new[] { promotion.trafficIndex, promotion.marketing, promotion.total };
        }

        private static HashSet<int> Running(List<Entry> entries)
        {
            var on = new HashSet<int>();
            foreach (var e in entries) if (e.Now) on.Add(e.Type);
            return on;
        }

        /// <summary>GetDailyMarketingExpenses over the planned flags: every enabled entry's price.</summary>
        private static float Cost(List<Entry> entries)
        {
            var sum = 0f;
            foreach (var e in entries)
            {
                if (!e.Now || e.Type < 0 || e.Type >= TypeNames.Length) continue;
                var settings = Entities.MarketingTypeSettings.Get((Entities.MarketingTypeName)e.Type);
                if (settings != null) sum += settings.pricePerDay;
            }
            return sum;
        }

        /// <summary>
        /// The agencies in the city, in the order the game's buildings list them: every
        /// building whose special service carries MarketingAgencySettings, with what it
        /// sells (MarketingAgencyDialog reads the same settings).
        /// </summary>
        private static List<Agency> Agencies()
        {
            var list = new List<Agency>();
            var all = Helpers.BuildingHelper.allBuildings;
            if (all == null) return list;
            foreach (var b in all)
            {
                if (b == null || b.SpecialService == null) continue;
                var settings = b.SpecialService.settings as Buildings.MarketingAgencySettings;
                if (settings == null || settings.marketingTypesAvailable == null) continue;
                var types = new List<int>();
                foreach (var t in settings.marketingTypesAvailable) types.Add((int)t);
                list.Add(new Agency { Building = b, Address = new WireAddress(b.StreetName, b.StreetNumber), Types = types });
            }
            return list;
        }

        private static Agency AgencyFor(List<Agency> agencies, int type)
        {
            return agencies.Find(a => a.Types.Contains(type));
        }

        /// <summary>
        /// Contact.GetContact's own test: a contact whose id is the agency's business name
        /// and whose description its business type. An agency with no registration yet
        /// takes the names its special service would give one.
        /// </summary>
        private static bool IsContact(Agency agency)
        {
            var contacts = SaveGameManager.Current.Contacts;
            if (contacts == null) return false;
            var reg = WriteService.FindRegistration(agency.Address);
            var name = reg != null ? reg.BusinessName : agency.Building.SpecialService.businessName;
            var description = reg != null ? reg.businessTypeName : agency.Building.SpecialService.businessTypeName;
            return contacts.Exists(c => c != null && c.id == name && c.description == description);
        }

        /// <summary>
        /// The agency in the phone's contacts: GetOrAddBusinessContact on its registration,
        /// as the game does when the player talks to its employee, but without the welcome
        /// chat (ContactsHelper.UnlockAllContacts passes false the same way). The building's
        /// GetRegistration makes one if the agency has none yet, as entering it would.
        /// </summary>
        private static void AddContact(Agency agency)
        {
            try
            {
                var reg = agency.Building.GetRegistration();
                if (reg != null) reg.GetOrAddBusinessContact(false);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("could not add the marketing agency as a contact: " + e.Message);
            }
        }

        /// <summary>BusinessHelper.UpdatePromotion acts only on building types tagged hasmarketingpromotion.</summary>
        private static bool HasPromotion(BuildingRegistration reg)
        {
            if (!reg.HasValidAddress) return false;
            var building = Helpers.BuildingHelper.GetBuilding(reg.Address);
            if (building == null) return false;
            var data = Buildings.BuildingTypeHelper.GetData(building);
            return data != null && data.HasTag(BigAmbitions.Tags.TagRef.Buildingtypetag.hasmarketingpromotion);
        }

        /// <summary>
        /// {trafficIndex, marketing, total} for the site running `on`, by the game's own
        /// arithmetic (build 3680 IL): GetMarketingEfficiency is
        /// min(1, Σ sqmReach × marketingReachMultiplier / squareMeters) × 100, zero where the
        /// building has no customer capacity; UpdatePromotion rounds it, then
        /// total = min(100, round(trafficIndex + marketing × marketingStrength)). Null when
        /// something it reads is missing; the answer then says so.
        /// </summary>
        private static int[] Predict(BuildingRegistration reg, HashSet<int> on)
        {
            try
            {
                var building = Helpers.BuildingHelper.GetBuilding(reg.Address);
                if (building == null) return null;
                var efficiency = 0f;
                var size = Buildings.BuildingSizeHelper.GetData(building);
                if (size != null && size.GetCustomerCapacity(building.BuildingType, building.BuildingVersion) != 0)
                {
                    var reach = 0f;
                    foreach (var type in on)
                    {
                        var settings = Entities.MarketingTypeSettings.Get((Entities.MarketingTypeName)type);
                        if (settings != null) reach += settings.sqmReach;
                    }
                    var multiplier = Buildings.BuildingTypeHelper.GetData(building.BuildingType).marketingReachMultiplier;
                    var sqm = Buildings.BuildingSizeHelper.GetData(building.BuildingSize).squareMeters;
                    efficiency = UnityEngine.Mathf.Min(reach * multiplier / sqm, 1f) * 100f;
                }
                var marketing = UnityEngine.Mathf.RoundToInt(efficiency);
                var strength = NeighborhoodHelper.GetData(building.Neighbourhood).marketingStrength;
                var total = Math.Min(UnityEngine.Mathf.RoundToInt(building.trafficIndex + marketing * strength), 100);
                return new[] { building.trafficIndex, marketing, total };
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("could not work out the promotion for a marketing write: " + e.Message);
                return null;
            }
        }

        /// <summary>
        /// The game's calls after campaigns change, as the phone makes them: UpdatePromotion
        /// rescores the site now instead of at the next update. Guarded: the flags are set,
        /// and a throw must not stop the next site. The answer then reads what it wrote.
        /// </summary>
        private static void AfterChange(Row row)
        {
            try
            {
                Helpers.BusinessHelper.UpdatePromotion(row.Registration);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("UpdatePromotion after a marketing write failed: " + e.Message);
            }
            try
            {
                row.AfterCost = row.Registration.GetDailyMarketingExpenses();
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("GetDailyMarketingExpenses failed: " + e.Message);
            }
            row.AfterPromotion = Snapshot(row.Registration.promotion);
        }

        private static void Fire(string gameEvent)
        {
            try
            {
                global::GameEvent.Invoke(gameEvent);
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("the new-marketing event failed: " + e.Message);
            }
        }

        private static WireAddress Wire(Address address)
        {
            return address == null ? new WireAddress("", 0) : new WireAddress(address.streetName ?? "", address.streetNumber);
        }

        private static string Name(int type)
        {
            return type >= 0 && type < TypeNames.Length ? TypeNames[type] : type.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        private static WriteAnswer Answer(List<Row> rows, List<Agency> contacts, bool dryRun, bool failed, bool undo, string stamp)
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
            w.Prop("kind", "marketing");
            w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);

            w.BeginArray("contactsAdded");
            foreach (var agency in contacts)
            {
                var reg = WriteService.FindRegistration(agency.Address);
                w.BeginObject();
                w.Prop("name", reg != null ? reg.BusinessName : agency.Building.SpecialService.businessName);
                WriteService.WriteAddress(w, "address", agency.Address.Street, agency.Address.Number);
                w.EndObject();
            }
            w.EndArray();

            w.BeginArray("rows");
            foreach (var row in rows) WriteRow(w, row);
            w.EndArray();
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }

        private static void WriteRow(JsonWriter w, Row row)
        {
            var planned = row.Error == null;
            var afterOn = new List<int>();
            if (planned)
            {
                var running = new SortedSet<int>(Running(row.Entries));
                afterOn.AddRange(running);
            }
            else afterOn.AddRange(row.BeforeOn);

            w.BeginObject();
            WriteService.WriteAddress(w, "address", row.Address.Street, row.Address.Number);
            w.Prop("business", row.Business);
            if (row.Registration == null) w.PropNull("before");
            else
            {
                w.BeginObject("before");
                Types(w, "on", row.BeforeOn);
                w.Prop("dailyCost", Math.Round((double)row.BeforeCost, 2));
                WritePromotion(w, row.BeforePromotion);
                w.EndObject();
            }
            Types(w, "on", row.Registration == null ? new List<int>() : afterOn);
            w.Prop("dailyCost", Math.Round((double)(planned ? row.AfterCost : row.BeforeCost), 2));
            WritePromotion(w, planned ? row.AfterPromotion : row.BeforePromotion);
            Types(w, "turnedOn", planned ? afterOn.FindAll(t => !row.BeforeOn.Contains(t)) : new List<int>());
            Types(w, "turnedOff", planned ? row.BeforeOn.FindAll(t => !afterOn.Contains(t)) : new List<int>());
            Types(w, "entriesAdded", planned ? row.Added : new List<int>());

            w.BeginArray("campaigns");
            if (planned)
            {
                var entries = new List<Entry>(row.Entries);
                // A stable sort by type: List.Sort is not stable, so the index breaks ties.
                var order = new Dictionary<Entry, int>();
                for (var i = 0; i < entries.Count; i++) order[entries[i]] = i;
                entries.Sort((a, b) => a.Type != b.Type ? a.Type.CompareTo(b.Type) : order[a].CompareTo(order[b]));
                foreach (var e in entries)
                {
                    w.BeginObject();
                    w.Prop("type", Name(e.Type));
                    WriteService.WriteAddress(w, "agency", e.Agency.Street, e.Agency.Number);
                    w.Prop("enabled", e.Now);
                    w.EndObject();
                }
            }
            w.EndArray();
            w.Prop("error", row.Error);
            w.EndObject();
        }

        private static void Types(JsonWriter w, string key, List<int> types)
        {
            w.BeginArray(key);
            foreach (var t in types) w.Value(Name(t));
            w.EndArray();
        }

        private static void WritePromotion(JsonWriter w, int[] promotion)
        {
            if (promotion == null)
            {
                w.PropNull("promotion");
                return;
            }
            w.BeginObject("promotion");
            w.Prop("trafficIndex", promotion[0]);
            w.Prop("marketing", promotion[1]);
            w.Prop("total", promotion[2]);
            w.EndObject();
        }
    }
}
