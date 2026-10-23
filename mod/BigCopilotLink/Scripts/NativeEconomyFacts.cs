using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using BigAmbitions.Items;
using Buildings;
using SpecialServices.Bank;

namespace BigCopilotLink
{
    /// <summary>Live registered native inputs, before any RLO settlement adjustment. No catalogue or registration cache writes.</summary>
    internal static class NativeEconomyFacts
    {
        internal static void Write(JsonWriter w, GameInstance game)
        {
            w.BeginObject("nativeEconomy");
            w.Prop("version", 1); w.Prop("model", "native-economy-v1");
            List<object> items = null;
            try
            {
                var registry = ItemsGetter.AllItems;
                if (registry != null)
                {
                    items = new List<object>();
                    foreach (var item in registry.Where(i => i != null).OrderBy(i => i.itemName, StringComparer.Ordinal))
                    {
                        if (string.IsNullOrEmpty(item.itemName)) throw new InvalidOperationException("Unknown registered item");
                        items.Add(new Dictionary<string, object> { { "itemId", item.itemName },
                            { "wholesaleAmount", Amount(item.wholesalePrice) }, { "defaultMarketAmount", Amount(item.DefaultMarketPrice) } });
                    }
                }
            }
            catch (Exception) { items = null; }
            w.BeginObject("itemPrices"); w.Prop("status", items == null ? "unavailable" : "ready");
            w.Prop("basis", "registered-catalogue-before-transaction-multipliers");
            w.Prop("gameMarketMultiplierIncluded", false); w.Prop("importMultiplierIncluded", false);
            w.PropTree("data", items); w.EndObject();
            List<object> banks = null;
            try
            {
                if (game.gameVariables != null)
                {
                    banks = new List<object>();
                    var rlo = AppDomain.CurrentDomain.GetAssemblies().Any(a => a.GetName().Name == "RealLifeOverhaul");
                    foreach (var b in Helpers.BuildingHelper.allBuildings.Where(b => b != null && b.SpecialService != null)
                        .OrderBy(b => b.StreetName, StringComparer.Ordinal).ThenBy(b => b.StreetNumber))
                    {
                        var settings = b.SpecialService.settings as BankSettings;
                        if (settings == null) continue;
                        banks.Add(new Dictionary<string, object> {
                            { "address", ModOwnership.Target(new WireAddress(b.StreetName, b.StreetNumber)) },
                            { "name", b.SpecialService.businessName }, { "capAmount", Amount(settings.maxTotalLoanAmount) },
                            { "annualRatePercent", settings.annualInterestRate }, { "yearsToPayLoan", settings.yearsToPayLoan },
                            { "paybackDays", Helpers.LoanHelper.CalculatePayBackDays(settings, game.gameVariables.daysPerYear) },
                            { "interestMultiplier", Amount(game.gameVariables.bankInterestMultiplier) },
                            { "eligibilityBasis", "native-statements-and-wealth" }, { "securedAccountRules", rlo ? "provider-owned" : "none" }
                        });
                    }
                }
            }
            catch (Exception) { banks = null; }
            Module(w, "banks", banks);
            w.EndObject();
        }

        internal static void NewLease(JsonWriter w, Building building, BuildingTypeData type, bool owned)
        {
            Dictionary<string, object> quote = null;
            try
            {
                // Avoid BuildingOwnedByPlayer / BuildingCached / Address getters: they
                // populate live caches. The native lease UI uses these same facts.
                var daily = owned ? 0 : building.GetBuildingDailyMarketRent();
                // CalculateDeposit's build-3682 body. Float multiplication and CeilToInt
                // are intentional, matching the game's quote instead of an estimated ratio.
                var deposit = owned ? 0 : UnityEngine.Mathf.CeilToInt((float)daily * type.daysToCalculateDeposit);
                if (daily < 0 || deposit < 0) throw new InvalidOperationException("Invalid lease quote");
                quote = new Dictionary<string, object> { { "rentCents", (long)daily * 100 }, { "depositCents", (long)deposit * 100 },
                    { "basis", owned ? "owned-no-lease" : "native-live-quote" }, { "depositBasis", owned ? "owned-no-lease" : "native-rent-times-deposit-days" } };
            }
            catch (Exception) { }
            w.BeginObject("newLease"); w.Prop("version", 1); w.Prop("status", quote == null ? "unavailable" : "ready");
            w.PropTree("data", quote); w.EndObject();
        }

        private static void Module(JsonWriter w, string name, object rows)
        {
            w.BeginObject(name); w.Prop("status", rows == null ? "unavailable" : "ready");
            w.PropTree("data", rows); w.EndObject();
        }

        private static string Amount(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value) || value < 0 || value > 1e12f) throw new InvalidOperationException("Invalid native amount");
            return value.ToString("R", CultureInfo.InvariantCulture);
        }
    }
}
