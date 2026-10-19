using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using BigAmbitions.Items;
using BigAmbitions.Tags;
using Buildings;
using Entities;
using Helpers;

namespace BigCopilotLink
{
    /// <summary>
    /// WholesaleStoreManagerDialog creates one contract per destination/wholesaler;
    /// BizManContractSettings cancels, edits and starts it for the next Monday 08:00.
    /// Read from installed build 3682. Never rushes an order or charges money itself.
    /// Both quote and apply check the live contact, opening, storage, products and caps.
    /// </summary>
    public static class WholesaleWrite
    {
        public sealed class Request
        {
            public WireAddress Address, Supplier;
            public string Mode, Snapshot, Quote, Character, Company;
            public readonly SortedDictionary<string, int> Items = new SortedDictionary<string, int>(StringComparer.Ordinal);
        }
        public sealed class UndoState
        {
            public DeliveryContract Target, Before;
            public int Day;
            public string After;
        }
        private sealed class Plan
        {
            public Request Request;
            public BuildingRegistration Shop, Supplier;
            public DeliveryContract Existing, After;
            public string Error, Quote;
            public float Cost;
            public bool Changed, DayChanged;
        }
        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request {
                Address = WriteService.ParseAddress(root, "address", "body"),
                Supplier = WriteService.ParseAddress(root, "supplier", "body"),
                Mode = JsonReader.Str(root, "mode", "body", true),
                Snapshot = JsonReader.Str(root, "snapshot", "body", true),
                Quote = JsonReader.Str(root, "quote", "body", false)
            };
            if (req.Mode != "weekly" && req.Mode != "once") throw new BadRequestException("body.mode must be weekly or once");
            var expect = JsonReader.Obj(JsonReader.Get(root, "expect"), "body.expect");
            req.Character = JsonReader.Str(expect, "character", "body.expect", true);
            req.Company = JsonReader.Str(expect, "company", "body.expect", true);
            if (string.IsNullOrEmpty(req.Snapshot) || string.IsNullOrEmpty(req.Character) || string.IsNullOrEmpty(req.Company))
                throw new BadRequestException("snapshot, expect.character and expect.company must not be empty");
            var items = JsonReader.Arr(JsonReader.Get(root, "items"), "body.items");
            if (items.Count == 0 || items.Count > 200) throw new BadRequestException("body.items must contain 1 to 200 products");
            foreach (var value in items)
            {
                var item = JsonReader.Obj(value, "body.items[]");
                var name = JsonReader.Str(item, "item", "body.items[]", true);
                var amount = JsonReader.Num(item, "amount", "body.items[]");
                if (string.IsNullOrEmpty(name) || !JsonReader.IsWhole(amount, 1, 1000000) || req.Items.ContainsKey(name))
                    throw new BadRequestException("each product must be unique, with an integer amount from 1 to 1000000");
                req.Items.Add(name, (int)amount);
            }
            return req;
        }
        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var p = new Plan { Request = req };
            p.Error = Check(ws, p);
            if (p.Error == null)
            {
                p.Quote = Digest(req.Snapshot + "|" + req.Mode + "|" + TimeHelper.CurrentDay + "|"
                    + State(p.Existing) + "|" + State(p.After) + "|" + p.Cost.ToString("R", CultureInfo.InvariantCulture)
                    + "|" + string.Join(";", SaveGameManager.Current.DeliveryContracts.Where(c => c.businessAddress == p.Shop.Address).Select(State).ToArray()));
                if (!dryRun && (string.IsNullOrEmpty(req.Quote) || req.Quote != p.Quote)) p.Error = "changed";
            }
            if (dryRun || p.Error != null) return Answer(p, dryRun, false, null);
            if (!p.Changed) { ws.WholesaleUndo = null; return Answer(p, false, false, ws.RefreshAfterWrite()); }
            var before = p.Existing == null ? null : Clone(p.Existing);
            var target = p.Existing ?? p.After;
            if (p.Existing == null) SaveGameManager.Current.DeliveryContracts.Add(target);
            else Copy(p.After, target);
            ws.WholesaleUndo = new UndoState { Target = target, Before = before, Day = TimeHelper.CurrentDay, After = State(target) };
            // The game's dialog and StartOrder events, without adding phone messages.
            foreach (var name in before == null ? new[] { "ba:gameevent_newdeliverycontract", "ba:gameevent_updateddeliverycontract" }
                : new[] { "ba:gameevent_updateddeliverycontract" })
            {
                try { GameEvent.Invoke(name); }
                catch (Exception e) { LinkMod.LogWarn("wholesale event: " + e.Message); }
            }
            return Answer(p, false, false, ws.Applied("bigcopilotlink_notify_wholesale", p.Shop.BusinessName));
        }
        private static string Check(WriteService ws, Plan p)
        {
            var req = p.Request;
            var game = SaveGameManager.Current;
            if (req.Character != game.characterId || req.Company != game.SaveGameName || req.Snapshot != ws.CurrentStamp) return "changed";
            p.Shop = WriteService.FindRegistration(req.Address);
            p.Supplier = WriteService.FindRegistration(req.Supplier);
            if (p.Shop == null || !p.Shop.RentedByPlayer) return "not_rented";
            if (p.Shop.businessTypeName == "ba:businesstype_empty"
                || !BuildingTypeHelper.GetData(p.Shop).HasTag(TagRef.Buildingtypetag.acceptswholesaledeliveries)) return "not_supported";
            if (p.Supplier == null) return "supplier_missing";
            var building = BuildingHelper.GetBuilding(p.Supplier.Address);
            var settings = building != null && building.SpecialService != null ? building.SpecialService.settings as WholesaleStoreSettings : null;
            if (settings == null) return "supplier_missing";
            if (game.Contacts == null || !game.Contacts.Exists(c => c != null && req.Supplier.Is(c.streetName, c.streetNumber))) return "no_contact";
            if (!BusinessHelper.IsBusinessOpen(p.Supplier, -1)) return "supplier_closed";
            // Refuse while the game's own contract editor could retain stale controls.
            if (UnityEngine.Object.FindObjectsOfType<UI.Smartphone.Apps.BizMan.BizManDeliveries>().Any(x => x.isActiveAndEnabled)) return "screen_open";
            if (p.Shop.itemInstances == null || !p.Shop.itemInstances.Values.Any(x => x != null && x.ItemCached.HasTag(TagRef.Itemtag.isbusinessstorage))) return "no_storage";
            var matches = game.DeliveryContracts.Where(c => c.businessAddress == p.Shop.Address && c.wholesaleAddress == p.Supplier.Address).ToList();
            if (matches.Count > 1) return "duplicate_contracts";
            p.Existing = matches.FirstOrDefault();
            if (p.Existing != null && p.Existing.enabled && (req.Mode == "once" || !p.Existing.repeatingOrder || p.Existing.isUrgentOrder)) return "active_order";
            if (p.Existing != null && !DeliveryHelper.CanModifyContract(p.Existing.nextDeliveryDay)) return "locked";
            // Restarting a weekly contract must not silently order products the
            // board did not list (for example a product without measured sales).
            if (req.Mode == "weekly" && p.Existing != null && p.Existing.items.Any(i => i.amount > 0 && !req.Items.ContainsKey(i.itemName))) return "other_products";
            var alreadySet = req.Mode == "weekly" && p.Existing != null && p.Existing.enabled && p.Existing.repeatingOrder
                && !p.Existing.isUrgentOrder && req.Items.All(e => p.Existing.items.Any(i => i.itemName == e.Key && i.amount == e.Value));
            var sale = p.Supplier.GetListOfItemsForSale();
            var offered = p.Shop.GetListOfItemsForSale();
            var type = BusinessTypeHelper.GetData(p.Shop);
            var primary = type.GetPrimaryProducts();
            foreach (var entry in req.Items)
            {
                var name = entry.Key;
                if (!sale.Contains(name) || !(offered.Contains(name) || primary.Contains(name)
                    || (name == "ba:itemname_paperbag" && type.HasTag(TagRef.Businesstag.customersneedpaperbags)))) return "product_unavailable";
                // A weekly figure is the total for the shop, not an additional order.
                if (req.Mode == "weekly" && game.DeliveryContracts.Any(c => c != p.Existing && c.businessAddress == p.Shop.Address
                    && c.enabled && c.repeatingOrder && c.items.Any(i => i.itemName == name && i.amount > 0))) return "other_contract";
                var item = ItemsGetter.GetByName(name);
                if (item == null) return "product_unavailable";
                var old = p.Existing == null ? null : p.Existing.items.Find(i => i.itemName == name);
                var ordered = old == null ? 0 : old.amountOrderedThisWeek;
                if (!alreadySet && !DeliveryHelper.AreWholesaleAndImportLimitsDisabled() && entry.Value > Math.Max(0, item.maxWholesaleOrderAmount - ordered)) return "over_cap";
                if (!alreadySet && ProductMarketHelper.IsProductInMarketEvent(name, MarketEventType.ProductBackorder, p.Supplier.Neighborhood)) return "backorder";
                if (!alreadySet && DeliveryHelper.GetOrderAmount(new DeliveryContractItem { itemName = name, amount = entry.Value }, item, p.Supplier) < entry.Value) return "shortage";
            }
            p.After = p.Existing == null ? new DeliveryContract { businessAddress = p.Shop.Address, wholesaleAddress = p.Supplier.Address,
                deliveryFee = settings.deliveryFee, items = new List<DeliveryContractItem>() } : Clone(p.Existing);
            // A fresh one-off contains only the requested products.
            if (req.Mode == "once") foreach (var item in p.After.items) item.amount = 0;
            foreach (var entry in req.Items)
            {
                var item = p.After.items.Find(i => i.itemName == entry.Key);
                if (item == null) { item = new DeliveryContractItem { itemName = entry.Key }; p.After.items.Add(item); }
                item.amount = entry.Value;
            }
            p.After.enabled = true;
            p.After.repeatingOrder = req.Mode == "weekly";
            p.After.isUrgentOrder = false;
            // Unchanged standing orders keep their next delivery exactly where it was.
            p.Changed = p.Existing == null || State(p.Existing) != State(p.After);
            if (p.Changed) p.After.nextDeliveryDay = DeliveryHelper.GetNextDeliveryDay();
            p.Cost = p.After.TotalPricePerDelivery;
            if (float.IsNaN(p.Cost) || float.IsInfinity(p.Cost) || p.Cost < 0) return "product_unavailable";
            return null;
        }
        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var target = state.Target;
            var req = new Request { Address = new WireAddress(target.businessAddress.streetName, target.businessAddress.streetNumber),
                Supplier = new WireAddress(target.wholesaleAddress.streetName, target.wholesaleAddress.streetNumber) };
            var p = new Plan { Request = req, Existing = target, After = state.Before, Changed = true, DayChanged = TimeHelper.CurrentDay != state.Day };
            if (TimeHelper.CurrentDay != state.Day || !SaveGameManager.Current.DeliveryContracts.Contains(target)
                || State(target) != state.After || !DeliveryHelper.CanModifyContract(target.nextDeliveryDay)) p.Error = "changed";
            else if (UnityEngine.Object.FindObjectsOfType<UI.Smartphone.Apps.BizMan.BizManDeliveries>().Any(x => x.isActiveAndEnabled)) p.Error = "screen_open";
            if (dryRun || p.Error != null) return Answer(p, dryRun, true, null);
            if (state.Before == null) SaveGameManager.Current.DeliveryContracts.Remove(target);
            else Copy(state.Before, target);
            ws.WholesaleUndo = null;
            return Answer(p, false, true, ws.Applied("bigcopilotlink_notify_undo_wholesale", ""));
        }
        private static DeliveryContract Clone(DeliveryContract c)
        {
            var copy = new DeliveryContract(); Copy(c, copy); return copy;
        }
        private static void Copy(DeliveryContract from, DeliveryContract to)
        {
            to.businessAddress = from.businessAddress; to.wholesaleAddress = from.wholesaleAddress;
            to.enabled = from.enabled; to.repeatingOrder = from.repeatingOrder; to.isUrgentOrder = from.isUrgentOrder;
            to.nextDeliveryDay = from.nextDeliveryDay; to.deliveryFee = from.deliveryFee;
            to.items = from.items.Select(i => new DeliveryContractItem { itemName = i.itemName, amount = i.amount,
                amountOrderedLastWeek = i.amountOrderedLastWeek, amountOrderedThisWeek = i.amountOrderedThisWeek }).ToList();
        }
        private static string State(DeliveryContract c)
        {
            if (c == null) return "none";
            var w = new JsonWriter(); w.BeginObject();
            WriteService.WriteAddress(w, "address", c.businessAddress.streetName, c.businessAddress.streetNumber);
            WriteService.WriteAddress(w, "supplier", c.wholesaleAddress.streetName, c.wholesaleAddress.streetNumber);
            w.Prop("enabled", c.enabled); w.Prop("repeating", c.repeatingOrder); w.Prop("urgent", c.isUrgentOrder);
            w.Prop("day", c.nextDeliveryDay); w.PropFloat("fee", c.deliveryFee);
            w.BeginArray("items");
            foreach (var item in c.items.OrderBy(i => i.itemName, StringComparer.Ordinal))
            {
                w.BeginObject(); w.Prop("item", item.itemName); w.Prop("amount", item.amount);
                w.Prop("ordered", item.amountOrderedThisWeek); w.Prop("last", item.amountOrderedLastWeek); w.EndObject();
            }
            w.EndArray(); w.EndObject(); return w.ToString();
        }
        private static string Digest(string text)
        {
            using (var hash = SHA256.Create()) return Convert.ToBase64String(hash.ComputeHash(Encoding.UTF8.GetBytes(text)));
        }
        private static WriteAnswer Answer(Plan p, bool dryRun, bool undo, string stamp)
        {
            var w = new JsonWriter(); w.BeginObject();
            if (p.Error != null && !dryRun) w.Prop("error", p.Error == "changed" ? "changed" : "refused");
            w.Prop("ok", p.Error == null); w.Prop("kind", "wholesale"); w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);
            if (p.Quote != null) w.Prop("quote", p.Quote);
            w.BeginArray("rows"); w.BeginObject();
            WriteService.WriteAddress(w, "address", p.Request.Address.Street, p.Request.Address.Number);
            WriteService.WriteAddress(w, "supplier", p.Request.Supplier.Street, p.Request.Supplier.Number);
            w.Prop("supplierName", p.Supplier != null ? p.Supplier.BusinessName : "");
            if (p.Error == null) w.PropNull("error"); else w.Prop("error", p.Error);
            w.Prop("set", p.Error == null && p.Changed);
            if (p.DayChanged) w.Prop("scope", "day");
            if (p.After != null && p.Error == null)
            {
                w.Prop("nextDeliveryDay", p.After.nextDeliveryDay); w.Prop("hour", 8);
                w.Prop("repeating", p.After.repeatingOrder); w.PropFloat("cost", p.Cost);
                w.BeginArray("items");
                foreach (var item in p.After.items.Where(i => i.amount > 0))
                { w.BeginObject(); w.Prop("item", item.itemName); w.Prop("amount", item.amount); w.EndObject(); }
                w.EndArray();
            }
            w.EndObject(); w.EndArray(); w.EndObject();
            return new WriteAnswer(p.Error != null && !dryRun ? 409 : 200, w.ToString());
        }
    }
}
