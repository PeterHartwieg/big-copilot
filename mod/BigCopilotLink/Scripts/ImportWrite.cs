using System;
using System.Collections.Generic;
using System.Reflection;
using Entities;

namespace BigCopilotLink
{
    /// <summary>
    /// POST /write/imports: purchasing-agent contract amounts, the running state and the
    /// plan order (docs/mod-write-back-scope.md section 4). The game's UI edits an amount
    /// only on a stopped contract, so a running one is Cancel, edit, Start
    /// (PurchasingAgentPlanUI, build 3680 IL); the mod writes the net of that: the new
    /// amount, isActive, nextDeliveryDay = DeliveryHelper.GetNextDeliveryDay() as Start
    /// sets it, isUrgentOrder cleared as Cancel clears it, and Cancel's lock rule
    /// (CanModifyContract) before it. Activating a stopped contract is Start plus
    /// Repeating on. The plan order is GameInstance.importPartnerships, which the game's
    /// deliveries walk in list order.
    /// </summary>
    public static class ImportWrite
    {
        public sealed class Request
        {
            public readonly List<ContractReq> Contracts = new List<ContractReq>();
            public List<string> Order;
        }

        public sealed class ContractReq
        {
            public string Id;
            public bool Activate;
            public readonly List<ProductReq> Products = new List<ProductReq>();
        }

        public sealed class ProductReq
        {
            public string ItemName;
            public bool HasWarehouse;
            public WireAddress Warehouse;
            public double Amount;
            public double Expect;
        }

        /// <summary>A contract's fields a write may change, as they stood at one moment.</summary>
        internal sealed class State
        {
            public ImportProduct[] Products;
            public int[] Amounts;
            public bool Active;
            public bool Repeating;
            public bool Urgent;
            public int NextDay;

            public static State Of(ImportPartnership ip)
            {
                var products = ip.products != null ? ip.products.ToArray() : new ImportProduct[0];
                var state = new State
                {
                    Products = products,
                    Amounts = new int[products.Length],
                    Active = ip.isActive,
                    Repeating = ip.isRepeatingOrder,
                    Urgent = ip.isUrgentOrder,
                    NextDay = ip.nextDeliveryDay
                };
                for (var i = 0; i < products.Length; i++) state.Amounts[i] = products[i] != null ? products[i].amount : 0;
                return state;
            }

            /// <summary>Everything back as it was: only for a write that threw halfway.</summary>
            public void Restore(ImportPartnership ip)
            {
                for (var i = 0; i < Products.Length; i++)
                    if (Products[i] != null) Products[i].amount = Amounts[i];
                ip.isActive = Active;
                ip.isRepeatingOrder = Repeating;
                ip.isUrgentOrder = Urgent;
                ip.nextDeliveryDay = NextDay;
            }
        }

        /// <summary>
        /// What one write changed on one contract, and only that: the amounts it moved and
        /// the flags it set. Undo checks those still hold what the write left and puts
        /// back those alone, so a field the player changed that the write never touched
        /// neither blocks the undo nor is overwritten by it.
        /// </summary>
        internal sealed class ContractChange
        {
            public ImportPartnership Contract;
            public readonly List<ImportProduct> Products = new List<ImportProduct>();
            public readonly List<int> Was = new List<int>();
            public readonly List<int> Now = new List<int>();
            public bool ActiveChanged, RepeatingChanged, UrgentChanged, NextDayChanged;
            public State Before;
            public State After;

            public static ContractChange Between(ImportPartnership ip, State before, State after)
            {
                var c = new ContractChange { Contract = ip, Before = before, After = after };
                for (var i = 0; i < before.Products.Length; i++)
                {
                    var product = before.Products[i];
                    var j = Array.IndexOf(after.Products, product);
                    if (product == null || j < 0 || after.Amounts[j] == before.Amounts[i]) continue;
                    c.Products.Add(product);
                    c.Was.Add(before.Amounts[i]);
                    c.Now.Add(after.Amounts[j]);
                }
                c.ActiveChanged = before.Active != after.Active;
                c.RepeatingChanged = before.Repeating != after.Repeating;
                c.UrgentChanged = before.Urgent != after.Urgent;
                c.NextDayChanged = before.NextDay != after.NextDay;
                return c;
            }

            /// <summary>The fields this write changed still hold what it left there.</summary>
            public bool Holds()
            {
                var ip = Contract;
                if (ActiveChanged && ip.isActive != After.Active) return false;
                if (RepeatingChanged && ip.isRepeatingOrder != After.Repeating) return false;
                if (UrgentChanged && ip.isUrgentOrder != After.Urgent) return false;
                if (NextDayChanged && ip.nextDeliveryDay != After.NextDay) return false;
                for (var i = 0; i < Products.Count; i++)
                    if (ip.products == null || !ip.products.Contains(Products[i]) || Products[i].amount != Now[i]) return false;
                return true;
            }

            /// <summary>Main thread: the changed fields back to what they were before the write.</summary>
            public void Undo()
            {
                var ip = Contract;
                for (var i = 0; i < Products.Count; i++) Products[i].amount = Was[i];
                if (ActiveChanged) ip.isActive = Before.Active;
                if (RepeatingChanged) ip.isRepeatingOrder = Before.Repeating;
                if (UrgentChanged) ip.isUrgentOrder = Before.Urgent;
                if (NextDayChanged) ip.nextDeliveryDay = Before.NextDay;
            }

            // The values the contract holds once undone: the old one where the write
            // changed it, the current one elsewhere.
            public bool ActiveAfterUndo { get { return ActiveChanged ? Before.Active : Contract.isActive; } }
            public bool RepeatingAfterUndo { get { return RepeatingChanged ? Before.Repeating : Contract.isRepeatingOrder; } }
            public int NextDayAfterUndo { get { return NextDayChanged ? Before.NextDay : Contract.nextDeliveryDay; } }
        }

        /// <summary>What the last applied write changed: per contract, and the plan order.</summary>
        public sealed class UndoState
        {
            internal readonly List<ContractChange> Changes = new List<ContractChange>();
            internal List<ImportPartnership> OrderBefore;
            internal List<ImportPartnership> OrderAfter;
        }

        private sealed class Row
        {
            public string Id;
            public ImportPartnership Contract;
            public string Error;
            public int ReopenDay = -1;
            public readonly List<ProductRow> Products = new List<ProductRow>();
            public bool Activates;
            public bool AmountsChange;
            public bool Reordered;
            public bool Restart;
            // What the contract holds after the write (a dry run: would hold); Known once set.
            public bool Known;
            public bool Active;
            public bool Repeating;
            public int NextDay;
            public float Total = float.NaN;
        }

        private sealed class ProductRow
        {
            public string ItemName;
            public Address Warehouse;
            public ImportProduct Product;
            public int Before;
            public int Amount;
            public bool Changes;
            public string Error;
            public int Max = -1;
        }

        // ---- HTTP thread -----------------------------------------------------------

        public static Request Parse(Dictionary<string, object> root)
        {
            var req = new Request();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var contracts = JsonReader.OptArr(root, "contracts", "body");
            for (var i = 0; i < contracts.Count; i++)
            {
                var path = "body.contracts[" + i + "]";
                var obj = JsonReader.Obj(contracts[i], path);
                var c = new ContractReq
                {
                    Id = JsonReader.Str(obj, "id", path, true),
                    Activate = JsonReader.Bool(obj, "activate", path, false)
                };
                if (!ids.Add(c.Id)) throw new BadRequestException(path + ".id repeats a contract");

                var keys = new HashSet<string>(StringComparer.Ordinal);
                var products = JsonReader.OptArr(obj, "products", path);
                for (var j = 0; j < products.Count; j++)
                {
                    var ppath = path + ".products[" + j + "]";
                    var pobj = JsonReader.Obj(products[j], ppath);
                    var p = new ProductReq { ItemName = JsonReader.Str(pobj, "itemName", ppath, true) };
                    if (JsonReader.Get(pobj, "warehouse") != null)
                    {
                        p.HasWarehouse = true;
                        p.Warehouse = WriteService.ParseAddress(pobj, "warehouse", ppath);
                    }
                    p.Amount = JsonReader.Num(pobj, "amount", ppath);
                    p.Expect = JsonReader.Num(pobj, "expect", ppath);
                    // An empty street is no warehouse, as SameAddress matches it.
                    var key = p.ItemName + "|" + (p.HasWarehouse && !string.IsNullOrEmpty(p.Warehouse.Street)
                        ? p.Warehouse.Street + "|" + p.Warehouse.Number
                        : "");
                    if (!keys.Add(key)) throw new BadRequestException(ppath + " repeats a product");
                    c.Products.Add(p);
                }
                req.Contracts.Add(c);
            }

            var order = JsonReader.Get(root, "order");
            if (order != null)
            {
                req.Order = new List<string>();
                var seen = new HashSet<string>(StringComparer.Ordinal);
                var arr = JsonReader.Arr(order, "body.order");
                for (var i = 0; i < arr.Count; i++)
                {
                    var id = arr[i] as string;
                    if (string.IsNullOrEmpty(id)) throw new BadRequestException("body.order[" + i + "] must be a contract id");
                    if (!seen.Add(id)) throw new BadRequestException("body.order[" + i + "] repeats a contract");
                    req.Order.Add(id);
                }
            }
            return req;
        }

        // ---- main thread -----------------------------------------------------------

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var list = SaveGameManager.Current.importPartnerships ?? new List<ImportPartnership>();
            var byId = new Dictionary<string, ImportPartnership>(StringComparer.Ordinal);
            foreach (var ip in list)
                if (ip != null && ip.id != null && !byId.ContainsKey(ip.id)) byId[ip.id] = ip;

            var rows = new List<Row>();
            var rowById = new Dictionary<string, Row>(StringComparer.Ordinal);
            foreach (var c in req.Contracts)
            {
                var row = Check(c, byId);
                rows.Add(row);
                rowById[row.Id] = row;
            }

            // The plan order: the slots the named contracts hold now, refilled in the
            // given order; every other contract keeps its place.
            List<ImportPartnership> orderBefore = null, orderAfter = null;
            if (req.Order != null)
            {
                var named = new List<ImportPartnership>();
                foreach (var id in req.Order)
                {
                    Row row;
                    if (!rowById.TryGetValue(id, out row))
                    {
                        row = new Row { Id = id };
                        rows.Add(row);
                        rowById[id] = row;
                    }
                    ImportPartnership ip;
                    if (!byId.TryGetValue(id, out ip))
                    {
                        if (row.Error == null) row.Error = "not_found";
                        continue;
                    }
                    row.Contract = ip;
                    named.Add(ip);
                }

                if (named.Count == req.Order.Count)
                {
                    var current = RelativeOrder(list, named);
                    if (!SameSequence(current, named))
                    {
                        orderBefore = current;
                        orderAfter = named;
                        var listOpen = WriteService.PlanListOpen();
                        foreach (var ip in named)
                        {
                            var row = rowById[ip.id];
                            row.Reordered = true;
                            if (row.Error == null && (listOpen || WriteService.PlanScreenOpenOn(ip))) row.Error = "screen_open";
                        }
                    }
                }
            }

            var failed = rows.Exists(r => r.Error != null || r.Products.Exists(p => p.Error != null));

            // Pass one, nothing kept: the values after the write. NextDeliveryTotal reads
            // the amounts, so the new ones go in for the read and always come back out.
            try
            {
                foreach (var row in rows)
                {
                    if (row.Contract == null) continue;
                    var ip = row.Contract;
                    foreach (var p in row.Products)
                        if (p.Product != null && p.Changes) p.Product.amount = p.Amount;

                    // Start (for a stopped contract being switched on) or Cancel + Start
                    // (for a running one whose amounts change).
                    row.Restart = row.Activates || (ip.isActive && row.AmountsChange);
                    row.Active = ip.isActive || row.Activates;
                    row.Repeating = row.Activates || ip.isRepeatingOrder;
                    row.NextDay = row.Restart ? DeliveryHelper.GetNextDeliveryDay() : ip.nextDeliveryDay;
                    row.Total = Total(ip);
                    row.Known = true;
                }
            }
            finally
            {
                foreach (var row in rows)
                foreach (var p in row.Products)
                    if (p.Product != null && p.Changes) p.Product.amount = p.Before;
            }

            if (dryRun || failed) return Answer(rows, dryRun, failed, false, null);

            // Pass two: the writes, plain field sets from values already worked out. Should
            // one throw all the same, every contract touched so far goes back as it was.
            var undo = new UndoState();
            var befores = new List<KeyValuePair<ImportPartnership, State>>();
            try
            {
                foreach (var row in rows)
                {
                    if (row.Contract == null || !(row.Activates || row.AmountsChange)) continue;
                    var ip = row.Contract;
                    var before = State.Of(ip);
                    befores.Add(new KeyValuePair<ImportPartnership, State>(ip, before));
                    foreach (var p in row.Products)
                        if (p.Product != null && p.Changes) p.Product.amount = p.Amount;
                    if (row.Restart)
                    {
                        ip.isActive = true;
                        ip.nextDeliveryDay = row.NextDay;
                        ip.isUrgentOrder = false;
                    }
                    if (row.Activates) ip.isRepeatingOrder = true;
                    undo.Changes.Add(ContractChange.Between(ip, before, State.Of(ip)));
                }
                if (orderAfter != null)
                {
                    Reorder(list, orderAfter);
                    undo.OrderBefore = orderBefore;
                    undo.OrderAfter = orderAfter;
                }
            }
            catch
            {
                foreach (var pair in befores) pair.Value.Restore(pair.Key);
                if (orderAfter != null && orderBefore != null && SameSequence(RelativeOrder(list, orderAfter), orderAfter))
                    Reorder(list, orderBefore);
                throw;
            }

            // The last write of the kind is what undo restores, even one that changed nothing.
            var changedAnything = undo.Changes.Count > 0 || orderAfter != null;
            ws.ImportUndo = changedAnything ? undo : null;

            var touched = undo.Changes.ConvertAll(c => c.Contract);
            var stamp = changedAnything
                ? ws.Applied("bigcopilotlink_notify_imports", Headquarters(touched, orderAfter))
                : ws.RefreshAfterWrite();
            return Answer(rows, false, false, false, stamp);
        }

        /// <summary>One contract's rules. "changed" first, then the contract's, then each product's.</summary>
        private static Row Check(ContractReq c, Dictionary<string, ImportPartnership> byId)
        {
            var row = new Row { Id = c.Id };
            ImportPartnership ip;
            if (!byId.TryGetValue(c.Id, out ip))
            {
                row.Error = "not_found";
                foreach (var p in c.Products)
                    row.Products.Add(new ProductRow { ItemName = p.ItemName, Warehouse = p.HasWarehouse ? new Address(p.Warehouse.Street, p.Warehouse.Number) : null });
                return row;
            }
            row.Contract = ip;

            var anyChanged = false;
            foreach (var p in c.Products)
            {
                var wanted = p.HasWarehouse ? new Address(p.Warehouse.Street, p.Warehouse.Number) : null;
                var pr = new ProductRow { ItemName = p.ItemName, Warehouse = wanted };
                row.Products.Add(pr);
                var product = ip.products != null
                    ? ip.products.Find(x => x != null && x.itemName == p.ItemName && WriteService.SameAddress(x.assignedWarehouse, wanted))
                    : null;
                if (product == null)
                {
                    pr.Error = "not_found";
                    continue;
                }
                pr.Product = product;
                pr.Warehouse = product.assignedWarehouse;
                pr.Before = product.amount;
                pr.Amount = product.amount;
                if (p.Expect != product.amount)
                {
                    pr.Error = "changed";
                    anyChanged = true;
                }
                else if (!JsonReader.IsWhole(p.Amount, 0, int.MaxValue)) pr.Error = "bad_amount";
                else
                {
                    pr.Amount = (int)p.Amount;
                    pr.Changes = pr.Amount != product.amount;
                }
            }

            row.AmountsChange = row.Products.Exists(p => p.Changes);
            row.Activates = c.Activate && !ip.isActive;
            var touched = row.Activates || row.AmountsChange;

            if (anyChanged) row.Error = "changed";
            else if (touched && WriteService.PlanScreenOpenOn(ip)) row.Error = "screen_open";
            else if (touched && NoAgent(ip)) row.Error = "no_agent";
            else if (row.AmountsChange && ip.isActive && !DeliveryHelper.CanModifyContract(ip.nextDeliveryDay))
            {
                // Cancel's rule: inside Sunday 20:00 to Monday 08:00 the imminent
                // Monday's delivery is in progress. It reopens Monday 08:00.
                row.Error = "locked";
                row.ReopenDay = ReopenDay();
            }

            foreach (var pr in row.Products)
            {
                if (pr.Error != null || pr.Product == null || !(pr.Changes || row.Activates)) continue;
                int left;
                if (pr.Changes && pr.Amount > 0 && InBackorder(pr.ItemName)) pr.Error = "backorder";
                else if (!ip.isTarget && TryRemainingCap(ip, pr.ItemName, out left) && pr.Amount > left)
                {
                    // A Smart Delivery amount is a stock level, so only a plain one is capped.
                    pr.Error = "over_cap";
                    pr.Max = left;
                }
                else if (pr.Amount > 0 && Streets.AddressHelper.IsUndefined(pr.Product.assignedWarehouse)) pr.Error = "no_warehouse";
            }

            // Start's own refusals: nothing to deliver, or something to deliver nowhere
            // (a product the request did not name counts too). They hold for a running
            // contract whose amounts change as well: that is Cancel, edit, Start.
            if ((row.Activates || (ip.isActive && row.AmountsChange)) && row.Error == null)
            {
                var anyAmount = false;
                foreach (var product in ip.products ?? new List<ImportProduct>())
                {
                    if (product == null) continue;
                    var pr = row.Products.Find(x => x.Product == product);
                    var amount = pr != null ? pr.Amount : product.amount;
                    if (amount > 0) anyAmount = true;
                    if (pr == null && amount > 0 && Streets.AddressHelper.IsUndefined(product.assignedWarehouse))
                        row.Products.Add(new ProductRow
                        {
                            ItemName = product.itemName, Product = product, Before = amount, Amount = amount, Error = "no_warehouse"
                        });
                }
                if (!anyAmount) row.Error = "no_amounts";
            }

            // The contract's row names the first product's refusal too, so a page that
            // reads only the contract error still sees why.
            if (row.Error == null)
            {
                var refused = row.Products.Find(p => p.Error != null);
                if (refused != null) row.Error = refused.Error;
            }
            return row;
        }

        public static WriteAnswer Undo(WriteService ws, UndoState state, bool dryRun)
        {
            var list = SaveGameManager.Current.importPartnerships ?? new List<ImportPartnership>();
            var rows = new List<Row>();
            var rowByContract = new Dictionary<ImportPartnership, Row>();

            foreach (var change in state.Changes)
            {
                var ip = change.Contract;
                var row = new Row { Id = ip.id, Contract = ip };
                rows.Add(row);
                rowByContract[ip] = row;
                // before: what the undo found; amount: what it puts back.
                for (var j = 0; j < change.Products.Count; j++)
                {
                    var product = change.Products[j];
                    row.Products.Add(new ProductRow
                    {
                        ItemName = product.itemName, Warehouse = product.assignedWarehouse, Product = product,
                        Before = product.amount, Amount = change.Was[j], Changes = product.amount != change.Was[j]
                    });
                }
                row.AmountsChange = change.Products.Count > 0;

                if (!list.Contains(ip) || !change.Holds()) row.Error = "changed";
                else if (WriteService.PlanScreenOpenOn(ip)) row.Error = "screen_open";
                else if (ip.isActive && (row.AmountsChange || change.ActiveChanged) && !DeliveryHelper.CanModifyContract(ip.nextDeliveryDay))
                {
                    // Putting amounts back on a running contract, or stopping one the write
                    // started, is the game's Cancel, with its lock rule.
                    row.Error = "locked";
                    row.ReopenDay = ReopenDay();
                }
            }

            if (state.OrderAfter != null)
            {
                var present = state.OrderAfter.TrueForAll(list.Contains);
                var holds = present && SameSequence(RelativeOrder(list, state.OrderAfter), state.OrderAfter);
                var listOpen = WriteService.PlanListOpen();
                foreach (var ip in state.OrderAfter)
                {
                    Row row;
                    if (!rowByContract.TryGetValue(ip, out row))
                    {
                        row = new Row { Id = ip.id, Contract = ip };
                        rows.Add(row);
                        rowByContract[ip] = row;
                    }
                    row.Reordered = true;
                    if (row.Error != null) continue;
                    if (!holds) row.Error = "changed";
                    else if (listOpen || WriteService.PlanScreenOpenOn(ip)) row.Error = "screen_open";
                }
            }

            var failed = rows.Exists(r => r.Error != null);

            // Pass one, nothing kept: the values once undone.
            try
            {
                foreach (var change in state.Changes)
                {
                    var row = rowByContract[change.Contract];
                    foreach (var p in row.Products)
                        if (p.Changes) p.Product.amount = p.Amount;
                    row.Active = change.ActiveAfterUndo;
                    row.Repeating = change.RepeatingAfterUndo;
                    row.NextDay = change.NextDayAfterUndo;
                    row.Total = Total(row.Contract);
                    row.Known = true;
                }
                foreach (var row in rows)
                {
                    if (row.Known || row.Contract == null) continue;
                    // Only reordered: nothing of its own changes.
                    row.Active = row.Contract.isActive;
                    row.Repeating = row.Contract.isRepeatingOrder;
                    row.NextDay = row.Contract.nextDeliveryDay;
                    row.Total = Total(row.Contract);
                    row.Known = true;
                }
            }
            finally
            {
                foreach (var row in rows)
                foreach (var p in row.Products)
                    if (p.Changes) p.Product.amount = p.Before;
            }

            if (dryRun || failed) return Answer(rows, dryRun, failed, true, null);

            // Pass two: the field sets, rolled back whole should one throw.
            var befores = new List<KeyValuePair<ImportPartnership, State>>();
            try
            {
                foreach (var change in state.Changes)
                {
                    befores.Add(new KeyValuePair<ImportPartnership, State>(change.Contract, State.Of(change.Contract)));
                    change.Undo();
                }
                if (state.OrderAfter != null) Reorder(list, state.OrderBefore);
            }
            catch
            {
                foreach (var pair in befores) pair.Value.Restore(pair.Key);
                throw;
            }

            ws.ImportUndo = null;
            var touched = state.Changes.ConvertAll(c => c.Contract);
            var stamp = ws.Applied("bigcopilotlink_notify_undo_imports", Headquarters(touched, state.OrderAfter));
            return Answer(rows, false, false, true, stamp);
        }

        private static int ReopenDay()
        {
            // Monday 08:00: tomorrow on a Sunday, today on a Monday.
            return TimeHelper.CurrentDay +
                   (TimeHelper.GetDayOfWeek() == BigAmbitions.DayNightCycle.DayOfWeekOrdered.Sunday ? 1 : 0);
        }

        // ---- the game's rules ------------------------------------------------------

        /// <summary>
        /// No purchasing agent, one who left (GetEmployeeById finds nobody), or one being
        /// replaced: DoDeliveries delivers nothing for any of them. showError false, unlike
        /// PurchasingAgentInstance, so a check never pops an error in game.
        /// </summary>
        private static bool NoAgent(ImportPartnership ip)
        {
            if (string.IsNullOrEmpty(ip.employeeInstanceId)) return true;
            var agent = Helpers.EmployeeHelper.GetEmployeeById(ip.employeeInstanceId, false);
            return agent == null || agent.isBeingReplaced;
        }

        /// <summary>DoDeliveries skips a product in a backorder event, with these exact arguments.</summary>
        private static bool InBackorder(string itemName)
        {
            return Helpers.ProductMarketHelper.IsProductInMarketEvent(itemName, MarketEventType.ProductBackorder, string.Empty, false);
        }

        // ImportPartnership.GetMaxOrderAmountPerImporter is private static on build 3680.
        private static readonly MethodInfo MaxPerImporterMethod = typeof(ImportPartnership).GetMethod(
            "GetMaxOrderAmountPerImporter", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public,
            null, new[] { typeof(string) }, null);

        /// <summary>
        /// The importer's weekly cap for the item, as DoDeliveries applies it: none when
        /// the difficulty turns limits off or ShouldLimitImporterMaxAmount says so (bags;
        /// factory ingredients at a raw-materials importer).
        /// </summary>
        private static bool TryCap(ImportPartnership ip, string itemName, out int cap)
        {
            cap = 0;
            try
            {
                if (DeliveryHelper.AreWholesaleAndImportLimitsDisabled()) return false;
                if (!DeliveryHelper.ShouldLimitImporterMaxAmount(itemName, ip.importAddress)) return false;
                cap = MaxPerImporter(itemName);
                return true;
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("could not read the import cap of " + itemName + ": " + e.Message);
                return false;
            }
        }

        /// <summary>
        /// What the importer still allows for the Monday delivery: the weekly cap less what
        /// the player's contracts with it already ordered of the item this week, urgent
        /// orders included (DoAllDeliveries clears the tally only after that Monday's
        /// deliveries, so it counts against them). The amounts are for the delivery a
        /// Start issued now would pick (a restart picks it; a stopped contract delivers
        /// only after some later Start). Inside the lock window that is the Monday after
        /// the imminent one, which comes after the reset, so the tally counts as 0 and the
        /// whole cap is left. False when no cap applies.
        /// </summary>
        private static bool TryRemainingCap(ImportPartnership ip, string itemName, out int left)
        {
            left = 0;
            int cap;
            if (!TryCap(ip, itemName, out cap)) return false;
            int ordered;
            try
            {
                // Inside the lock window the delivery Start picks is the Monday after the
                // imminent one, and the imminent Monday's DoAllDeliveries clears the tally
                // first: nothing ordered this week counts against it.
                ordered = DeliveryHelper.IsLockPeriod()
                    ? 0
                    : ImportPartnership.GetItemAmountOrderedThisWeek(ip.importAddress, itemName);
            }
            catch (Exception)
            {
                ordered = 0;
            }
            left = Math.Max(0, cap - ordered);
            return true;
        }

        /// <summary>
        /// The game's private method by reflection; should a later build rename it, its
        /// build-3682 body: the item's maxOrderAmountPerImporter, times 0.66 rounded
        /// while the item is in a shortage event.
        /// </summary>
        private static int MaxPerImporter(string itemName)
        {
            if (MaxPerImporterMethod != null)
            {
                try
                {
                    return (int)MaxPerImporterMethod.Invoke(null, new object[] { itemName });
                }
                catch (Exception e)
                {
                    LinkMod.LogWarn("GetMaxOrderAmountPerImporter could not be called (" + e.Message + "); using its build-3682 body.");
                }
            }
            var item = BigAmbitions.Items.ItemsGetter.GetByName(itemName, true);
            var cap = item != null ? item.maxOrderAmountPerImporter : 0;
            if (Helpers.ProductMarketHelper.IsProductInMarketEvent(itemName, MarketEventType.ProductShortage, null, false))
                cap = UnityEngine.Mathf.RoundToInt(cap * 0.66f);
            return cap;
        }

        private static float Total(ImportPartnership ip)
        {
            try
            {
                return ip.NextDeliveryTotal;
            }
            catch (Exception e)
            {
                LinkMod.LogWarn("NextDeliveryTotal failed for a contract: " + e.Message);
                return float.NaN;
            }
        }

        // ---- the plan order --------------------------------------------------------

        /// <summary>The given contracts in the order importPartnerships holds them now.</summary>
        private static List<ImportPartnership> RelativeOrder(List<ImportPartnership> list, List<ImportPartnership> named)
        {
            var result = new List<ImportPartnership>();
            foreach (var ip in list)
                if (named.Contains(ip) && !result.Contains(ip)) result.Add(ip);
            return result;
        }

        private static bool SameSequence(List<ImportPartnership> a, List<ImportPartnership> b)
        {
            if (a.Count != b.Count) return false;
            for (var i = 0; i < a.Count; i++)
                if (!ReferenceEquals(a[i], b[i])) return false;
            return true;
        }

        /// <summary>
        /// The slots the given contracts hold, refilled in the given order. The game's own
        /// drag (PurchasingAgentsPlanList.OnPlanReordered) is Remove and Insert of one
        /// entry; this is the same list, rewritten only where those contracts sit.
        /// </summary>
        private static void Reorder(List<ImportPartnership> list, List<ImportPartnership> order)
        {
            var slots = new List<int>();
            for (var i = 0; i < list.Count; i++)
                if (order.Contains(list[i])) slots.Add(i);
            for (var k = 0; k < slots.Count && k < order.Count; k++) list[slots[k]] = order[k];
        }

        private static string Headquarters(List<ImportPartnership> contracts, List<ImportPartnership> order)
        {
            var names = new List<string>();
            var all = new List<ImportPartnership>(contracts);
            if (order != null) all.AddRange(order);
            foreach (var ip in all)
            {
                var reg = WriteService.FindRegistration(ip.headquartersAddress);
                var name = reg != null ? reg.BusinessName : null;
                if (name != null && !names.Contains(name)) names.Add(name);
            }
            return names.Count == 1 ? names[0] : WriteService.Count(names.Count, "headquarters", "headquarters");
        }

        // ---- the answer ------------------------------------------------------------

        private static WriteAnswer Answer(List<Row> rows, bool dryRun, bool failed, bool undo, string stamp)
        {
            var anyChanged = rows.Exists(r => r.Error == "changed" || r.Products.Exists(p => p.Error == "changed"));
            var w = new JsonWriter();
            w.BeginObject();
            var status = 200;
            if (failed && !dryRun)
            {
                status = 409;
                w.Prop("error", anyChanged ? "changed" : "refused");
            }
            w.Prop("ok", !failed);
            w.Prop("kind", "imports");
            w.Prop("dryRun", dryRun);
            if (undo) w.Prop("undo", true);
            if (stamp != null) w.Prop("stamp", stamp);
            w.PropFloat("cash", SaveGameManager.Current.Money);

            w.BeginArray("rows");
            foreach (var row in rows) WriteRow(w, row);
            w.EndArray();
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }

        private static void WriteRow(JsonWriter w, Row row)
        {
            var ip = row.Contract;
            w.BeginObject();
            w.Prop("id", row.Id);
            if (ip == null || !row.Known)
            {
                w.PropNull("importer");
                w.PropNull("active");
                w.PropNull("repeating");
                w.Prop("reactivated", false);
                w.PropNull("nextDeliveryDay");
                w.PropNull("nextDeliveryTotal");
            }
            else
            {
                var importer = WriteService.FindRegistration(ip.importAddress);
                w.Prop("importer", importer != null ? importer.BusinessName : null);
                w.Prop("active", row.Active);
                w.Prop("repeating", row.Repeating);
                w.Prop("reactivated", row.Activates);
                w.Prop("nextDeliveryDay", row.NextDay);
                w.PropFloat("nextDeliveryTotal", row.Total);
            }
            w.Prop("reordered", row.Reordered);
            w.Prop("error", row.Error);
            if (row.ReopenDay >= 0)
            {
                w.BeginObject("reopens");
                w.Prop("day", row.ReopenDay);
                w.Prop("hour", 8);
                w.EndObject();
            }
            else w.PropNull("reopens");

            w.BeginArray("products");
            foreach (var p in row.Products) WriteProduct(w, ip, p);
            w.EndArray();
            w.EndObject();
        }

        private static void WriteProduct(JsonWriter w, ImportPartnership ip, ProductRow p)
        {
            w.BeginObject();
            w.Prop("itemName", p.ItemName);
            WriteService.WriteAddress(w, "warehouse", p.Warehouse);
            if (p.Product == null || ip == null)
            {
                w.PropNull("before");
                w.PropNull("amount");
                w.PropNull("smart");
                w.PropNull("unitPrice");
                w.PropNull("cap");
                w.PropNull("orderedThisWeek");
            }
            else
            {
                w.Prop("before", p.Before);
                w.Prop("amount", p.Amount);
                w.Prop("smart", ip.isTarget);
                w.PropFloat("unitPrice", UnitPrice(ip, p.Product));
                int cap;
                if (TryCap(ip, p.ItemName, out cap)) w.Prop("cap", cap);
                else w.PropNull("cap");
                int ordered;
                try
                {
                    ordered = ImportPartnership.GetItemAmountOrderedThisWeek(ip.importAddress, p.ItemName);
                }
                catch (Exception)
                {
                    ordered = 0;
                }
                w.Prop("orderedThisWeek", ordered);
            }
            w.Prop("error", p.Error);
            if (p.Max >= 0) w.Prop("max", p.Max);
            else w.PropNull("max");
            w.EndObject();
        }

        /// <summary>Per unit after the agent's discount, as DoDeliveries charges it (urgent fee aside).</summary>
        private static float UnitPrice(ImportPartnership ip, ImportProduct product)
        {
            try
            {
                return product.Price * ip.GetDiscount;
            }
            catch (Exception)
            {
                return float.NaN;
            }
        }
    }
}
