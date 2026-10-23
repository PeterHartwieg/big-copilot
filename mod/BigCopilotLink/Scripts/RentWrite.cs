using System;
using System.Collections.Generic;
using UnityEngine;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/rent (from 0.6.0): the rent price a m² of buildings the player owns
    /// (docs/game-link-api.md, POST /write/rent). The game's own path, from build 3682 IL:
    /// RealEstateSettings.SetRentManagementData takes m =
    /// RealEstate.Building.GetBuildingDailyMarketRentPerSqm(), _minRent =
    /// RoundToInt(m·0.8·100)/100, _maxRent = RoundToInt(m·1.2·100)/100; ApplyNewRent then
    /// sets RealEstate.pendingPricePerSqm = _minRent + RoundToInt(slider·(max−min)·100)/100
    /// and RealEstate.daysUntilUpdatingPricePerSqm = 7, and nothing else (no event, no
    /// transaction; RealEstateHelper.UpdatePlayerRealEstate counts the days down and copies
    /// the pending price into pricePerSqm when they reach 0). The mod sets those two fields
    /// the same way, to the asked price clamped to [min, max] and rounded to the cent, which
    /// is the value the slider would land on. It never writes pricePerSqm (that would skip
    /// the seven days, which the game cannot). Hamptons villas are refused: OnEnable hides
    /// rent management when Building.IsHamptonsHouse() (BuildingSize "ba:buildingsize_t"),
    /// and UpdatePlayerRealEstate pays them nothing. A price equal to the pending one is
    /// left alone, as ChangeNewRentValue leaves the Apply button off then
    /// (interactable = value != pendingPricePerSqm), so its seven days are not restarted.
    /// </summary>
    public static class RentWrite
    {
        /// <summary>RealEstateSettings.ApplyNewRent's wait, in daily ticks.</summary>
        private const int WaitDays = 7;

        /// <summary>Prices are compared to the cent: the game holds them as floats.</summary>
        private const double HalfCent = 0.005;

        public sealed class Request
        {
            public readonly List<Item> Items = new List<Item>();
            /// <summary>body.expect.character and .company, as for uniforms; null: not checked.</summary>
            public string ExpectCharacter;
            public string ExpectCompany;
        }

        public sealed class Item
        {
            public WireAddress Address;
            public double Price;
            public double ExpectPrice;
            public double ExpectPending;
        }

        /// <summary>What one write set: undo puts back each building where it still holds what the write left.</summary>
        public sealed class UndoState
        {
            public readonly List<Entry> Entries = new List<Entry>();
        }

        public sealed class Entry
        {
            public WireAddress Address;
            public float Price;        // pricePerSqm at the write, unchanged by it
            public float OldPending;
            public int OldDays;
            public float NewPending;
        }

        private sealed class Row
        {
            public WireAddress Address;
            public Entities.RealEstate RealEstate;
            public string Error;
            public bool KnownBuilding;   // the entry and its building were found: market figures are written
            public double Asked;
            public bool Clamped;
            public bool Set;
            public float Market, Min, Max;
            // Before: what the game holds.
            public float BeforePrice, BeforePending;
            public int BeforeDays;
            public bool HasBefore;
            // After: what the game will hold (a dry run: after an apply made now).
            public float AfterPending;
            public int AfterDays;
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
            // One row per building: two rows for one would each plan against the state
            // before either applied, and the undo would record the first row's price.
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var items = JsonReader.Arr(JsonReader.Get(root, "items"), "body.items");
            // An empty call would set nothing and still replace the last write's undo.
            if (items.Count == 0) throw new BadRequestException("body.items must name at least one building");
            for (var i = 0; i < items.Count; i++)
            {
                var path = "body.items[" + i + "]";
                var obj = JsonReader.Obj(items[i], path);
                var item = new Item { Address = WriteService.ParseAddress(obj, "address", path) };
                item.Price = JsonReader.Num(obj, "pricePerSqm", path);
                if (!IsFinite(item.Price) || item.Price <= 0)
                    throw new BadRequestException(path + ".pricePerSqm must be a number above 0");
                var guard = JsonReader.Obj(JsonReader.Get(obj, "expect"), path + ".expect");
                item.ExpectPrice = JsonReader.Num(guard, "pricePerSqm", path + ".expect");
                item.ExpectPending = JsonReader.Num(guard, "pendingPricePerSqm", path + ".expect");
                if (!IsFinite(item.ExpectPrice) || item.ExpectPrice < 0 || !IsFinite(item.ExpectPending) || item.ExpectPending < 0)
                    throw new BadRequestException(path + ".expect prices must be numbers of 0 or more");
                if (!seen.Add(item.Address.Street + "|" + item.Address.Number))
                    throw new BadRequestException(path + ".address repeats a building");
                req.Items.Add(item);
            }
            return req;
        }

        private static bool IsFinite(double value)
        {
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var game = SaveGameManager.Current;
            var rows = new List<Row>();
            var failed = false;
            // Another save loaded since the page read the bytes: the address names another
            // company's building, so none is touched. The same fields /health reports.
            var otherSave =
                (req.ExpectCharacter != null && !string.Equals(req.ExpectCharacter, game.characterId ?? "", StringComparison.Ordinal)) ||
                (req.ExpectCompany != null && !string.Equals(req.ExpectCompany, game.SaveGameName ?? "", StringComparison.Ordinal));

            foreach (var item in req.Items)
            {
                var row = new Row { Address = item.Address, Asked = item.Price };
                rows.Add(row);
                if (otherSave)
                {
                    row.Error = "changed";
                    failed = true;
                    continue;
                }
                row.Error = CheckItem(row, item);
                if (row.Error != null)
                {
                    failed = true;
                    continue;
                }
                Plan(row, item.Price);
            }

            var day = TimeHelper.CurrentDay;
            if (!failed)
            {
                var refusal = Ownership(rows, dryRun ? "review" : "apply");
                if (refusal.HasValue) return refusal.Value;
            }
            if (dryRun || failed) return Answer(rows, day, dryRun, failed, false, null);

            var undo = new UndoState();
            foreach (var row in rows)
            {
                if (!row.Set) continue;
                undo.Entries.Add(new Entry
                {
                    Address = row.Address,
                    Price = row.BeforePrice,
                    OldPending = row.BeforePending,
                    OldDays = row.BeforeDays,
                    NewPending = row.AfterPending
                });
                // RealEstateSettings.ApplyNewRent's two stores, and nothing else.
                row.RealEstate.pendingPricePerSqm = row.AfterPending;
                row.RealEstate.daysUntilUpdatingPricePerSqm = WaitDays;
            }
            // The last write of the kind is what undo restores; one that set nothing leaves nothing.
            ws.RentUndo = undo.Entries.Count > 0 ? undo : null;

            string stamp;
            if (undo.Entries.Count > 0)
                stamp = ws.Applied("bigcopilotlink_notify_rent",
                    new Dictionary<string, string> { { "buildings", WriteService.Count(undo.Entries.Count, "building", "buildings") } });
            else stamp = ws.RefreshAfterWrite();
            return Answer(rows, day, false, false, false, stamp);
        }

        private static WriteAnswer? Ownership(List<Row> rows, string phase)
        {
            var targets = new List<Dictionary<string, object>>();
            foreach (var row in rows)
            {
                var target = ModOwnership.Target(row.Address);
                targets.Add(target);
            }
            return ModOwnership.Check("rent", phase, targets);
        }

        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var rows = new List<Row>();
            var changed = false;

            foreach (var entry in state.Entries)
            {
                var row = new Row { Address = entry.Address, Asked = entry.OldPending };
                rows.Add(row);
                row.RealEstate = FindRealEstate(entry.Address);
                if (row.RealEstate == null)
                {
                    // Sold since: there is nothing left to put back.
                    row.Error = "changed";
                    changed = true;
                    continue;
                }
                ReadBefore(row);
                ReadMarket(row);
                // Exactly what the write left, and no daily tick since (the counter would
                // be 6): the player's own change in BizMan, or a day passing, ends the undo.
                if (Math.Abs(row.RealEstate.pendingPricePerSqm - entry.NewPending) >= HalfCent ||
                    row.RealEstate.daysUntilUpdatingPricePerSqm != WaitDays ||
                    Math.Abs(row.RealEstate.pricePerSqm - entry.Price) >= HalfCent)
                {
                    row.Error = "changed";
                    changed = true;
                    continue;
                }
                row.Set = true;
                row.AfterPending = entry.OldPending;
                row.AfterDays = entry.OldDays;
            }

            var day = TimeHelper.CurrentDay;
            if (!changed)
            {
                var refusal = Ownership(rows, "undo");
                if (refusal.HasValue) return refusal.Value;
            }
            if (dryRun || changed) return Answer(rows, day, dryRun, changed, true, null);

            for (var i = 0; i < rows.Count; i++)
            {
                rows[i].RealEstate.pendingPricePerSqm = state.Entries[i].OldPending;
                rows[i].RealEstate.daysUntilUpdatingPricePerSqm = state.Entries[i].OldDays;
            }
            ws.RentUndo = null;

            var stamp = ws.Applied("bigcopilotlink_notify_undo_rent",
                new Dictionary<string, string> { { "buildings", WriteService.Count(rows.Count, "building", "buildings") } });
            return Answer(rows, day, false, false, true, stamp);
        }

        /// <summary>The item rules, in the contract's order; sets RealEstate, before and market on the way.</summary>
        private static string CheckItem(Row row, Item item)
        {
            var estate = FindRealEstate(row.Address);
            // An entry whose address the city has no building at cannot be priced.
            if (estate == null || estate.Building == null) return "not_owned";
            row.RealEstate = estate;
            ReadBefore(row);
            ReadMarket(row);
            if (Math.Abs(estate.pricePerSqm - item.ExpectPrice) >= HalfCent ||
                Math.Abs(estate.pendingPricePerSqm - item.ExpectPending) >= HalfCent) return "changed";
            if (estate.Building.IsHamptonsHouse()) return "villa";
            return null;
        }

        /// <summary>
        /// Main thread. The player's real estate at an address, or null:
        /// GameInstance.realEstate, matched as RealEstateSettings.OnEnable matches it (by
        /// address), searched plainly so nothing is created.
        /// </summary>
        private static Entities.RealEstate FindRealEstate(WireAddress address)
        {
            var game = SaveGameManager.Current;
            if (game == null || game.realEstate == null) return null;
            var list = game.realEstate;
            for (var i = 0; i < list.Count; i++)
            {
                var e = list[i];
                if (e != null && e.address != null && address.Is(e.address.streetName, e.address.streetNumber)) return e;
            }
            return null;
        }

        private static void ReadBefore(Row row)
        {
            var e = row.RealEstate;
            row.HasBefore = true;
            row.BeforePrice = e.pricePerSqm;
            row.BeforePending = e.pendingPricePerSqm;
            row.BeforeDays = e.daysUntilUpdatingPricePerSqm;
            // A refused or unchanged row answers the building as it stands.
            row.AfterPending = e.pendingPricePerSqm;
            row.AfterDays = e.daysUntilUpdatingPricePerSqm;
        }

        /// <summary>SetRentManagementData's figures: m, and the slider's ends in whole cents.</summary>
        private static void ReadMarket(Row row)
        {
            var building = row.RealEstate.Building;
            if (building == null) return;
            row.KnownBuilding = true;
            row.Market = building.GetBuildingDailyMarketRentPerSqm();
            row.Min = Mathf.RoundToInt(row.Market * 0.8f * 100f) / 100f;
            row.Max = Mathf.RoundToInt(row.Market * 1.2f * 100f) / 100f;
        }

        /// <summary>
        /// The price ApplyNewRent would store for the asked one: clamped to the slider and
        /// rounded to the cent (min and max are whole cents, so this is min plus whole
        /// cents, as the slider's arithmetic gives). Equal to the pending price: unchanged.
        /// </summary>
        private static void Plan(Row row, double asked)
        {
            var clampedPrice = Mathf.Clamp((float)asked, row.Min, row.Max);
            row.Clamped = Math.Abs(clampedPrice - asked) >= HalfCent;
            var price = Mathf.RoundToInt(clampedPrice * 100f) / 100f;
            if (Math.Abs(price - row.BeforePending) < HalfCent) return; // the Apply button stays off
            row.Set = true;
            row.AfterPending = price;
            row.AfterDays = WaitDays;
        }

        private static WriteAnswer Answer(List<Row> rows, int day, bool dryRun, bool failed, bool undo, string stamp)
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
            w.Prop("kind", "rent");
            w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);
            w.Prop("day", day);

            w.BeginArray("rows");
            foreach (var row in rows)
            {
                w.BeginObject();
                WriteService.WriteAddress(w, "address", row.Address.Street, row.Address.Number);
                if (row.HasBefore)
                {
                    w.BeginObject("before");
                    w.PropFloat("pricePerSqm", row.BeforePrice);
                    w.PropFloat("pendingPricePerSqm", row.BeforePending);
                    w.Prop("daysUntilUpdatingPricePerSqm", row.BeforeDays);
                    w.EndObject();
                    w.PropFloat("pricePerSqm", row.BeforePrice);
                    w.PropFloat("pendingPricePerSqm", row.AfterPending);
                    w.Prop("daysUntilUpdatingPricePerSqm", row.AfterDays);
                    if (row.AfterDays > 0) w.Prop("appliesOnDay", day + row.AfterDays);
                    else w.PropNull("appliesOnDay");
                    w.Prop("totalSqm", row.RealEstate.totalSqm);
                }
                else
                {
                    // Not the player's building (or another save's): nothing to say about it.
                    w.PropNull("before");
                    w.PropNull("pricePerSqm");
                    w.PropNull("pendingPricePerSqm");
                    w.PropNull("daysUntilUpdatingPricePerSqm");
                    w.PropNull("appliesOnDay");
                    w.PropNull("totalSqm");
                }
                w.Prop("asked", Math.Round(row.Asked, 4));
                w.Prop("clamped", row.Clamped);
                w.Prop("set", row.Set);
                if (row.KnownBuilding)
                {
                    w.PropFloat("marketRentPerSqm", row.Market);
                    w.PropFloat("min", row.Min);
                    w.PropFloat("max", row.Max);
                }
                else
                {
                    w.PropNull("marketRentPerSqm");
                    w.PropNull("min");
                    w.PropNull("max");
                }
                w.Prop("error", row.Error);
                w.EndObject();
            }
            w.EndArray();
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }
    }
}
