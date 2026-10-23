using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>Read-only runtime facts. Capture only on Unity's main thread.
    /// The stable JSON is also the refresh consistency fingerprint.</summary>
    internal static class BuildingFacts
    {
        internal static string Capture(GameInstance game)
        {
            if (game == null || Helpers.BuildingHelper.allBuildings == null)
                throw new InvalidOperationException("The city is not ready for building facts");
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("schemaVersion", 1);
            w.Prop("model", "building-values-v1");
            w.Prop("character", game.characterId);
            w.Prop("build", game.buildNumberAtLastSave);
            w.Prop("marketingModel", "marketing-six-v1");
            w.BeginArray("marketingTypes");
            foreach (Entities.MarketingTypeName kind in Enum.GetValues(typeof(Entities.MarketingTypeName)))
            {
                if (kind.ToString() == "None") continue;
                var settings = Entities.MarketingTypeSettings.Get(kind);
                // None is an enum sentinel, not a campaign. A future real
                // campaign is included; clients gate only unsupported calculations.
                if (settings == null) throw new InvalidOperationException("Missing marketing settings");
                w.BeginObject();
                w.Prop("id", (int)kind);
                w.Prop("name", kind.ToString());
                w.Prop("price", (double)settings.pricePerDay);
                w.Prop("reach", (double)settings.sqmReach);
                w.EndObject();
            }
            w.EndArray();
            w.BeginObject("vehiclePrices");
            w.Prop("schemaVersion", 1);
            w.Prop("model", "registered-vehicle-wealth-v1");
            w.BeginObject("prices");
            foreach (var price in VehiclePrices()) w.Prop(price.Key, price.Value);
            w.EndObject();
            w.EndObject();
            EconomyFacts.Write(w);
            NativeEconomyFacts.Write(w, game);
            var regs = new Dictionary<string, BuildingRegistration>();
            foreach (var reg in game.BuildingRegistrations)
                if (reg != null) regs[Key(reg.StreetName, reg.StreetNumber)] = reg;
            var owned = new HashSet<string>(StringComparer.Ordinal);
            if (game.realEstate != null)
                foreach (var estate in game.realEstate)
                    if (estate != null && estate.address != null) owned.Add(Key(estate.address.streetName, estate.address.streetNumber));
            w.BeginArray("buildings");
            foreach (var b in Helpers.BuildingHelper.allBuildings)
            {
                if (b == null || string.IsNullOrEmpty(b.StreetName)) continue;
                var size = Buildings.BuildingSizeHelper.GetData(b.BuildingSize);
                var type = Buildings.BuildingTypeHelper.GetData(b.BuildingType);
                if (size == null || type == null) throw new InvalidOperationException("Missing building definition");
                w.BeginObject();
                w.Prop("street", b.StreetName);
                w.Prop("number", b.StreetNumber);
                w.Prop("type", b.BuildingType);
                w.Prop("size", b.BuildingSize);
                w.Prop("version", b.BuildingVersion);
                w.Prop("neighbourhood", b.Neighbourhood);
                w.Prop("area", (double)size.squareMeters);
                w.Prop("propertyArea", (double)b.totalSqm);
                w.Prop("capacity", b.GetCustomerCapacity);
                w.Prop("traffic", (double)b.trafficIndex);
                NativeEconomyFacts.NewLease(w, b, type, owned.Contains(Key(b.StreetName, b.StreetNumber)));
                BuildingRegistration reg;
                if (regs.TryGetValue(Key(b.StreetName, b.StreetNumber), out reg))
                {
                    // Include current observations in the consistency comparison:
                    // a mid-walk renovation/recalculation must retry publication.
                    w.Prop("effectiveCapacity", reg.customerCapacity);
                    w.Prop("rent", (double)reg.RentPerDay);
                    w.Prop("signedDepositCents", Math.Round((double)reg.lastDeposit * 100, MidpointRounding.AwayFromZero));
                    if (reg.promotion != null)
                    {
                        w.Prop("marketingNow", reg.promotion.marketing);
                        w.Prop("promotionNow", reg.promotion.total);
                    }
                }
                var hood = NeighborhoodHelper.GetData(b.Neighbourhood);
                if (hood != null)
                {
                    w.BeginObject("marketing");
                    w.Prop("reachMultiplier", (double)type.marketingReachMultiplier);
                    w.Prop("strength", (double)hood.marketingStrength);
                    w.EndObject();
                }
                w.EndObject();
            }
            w.EndArray();
            w.BeginArray("agencies");
            foreach (var b in Helpers.BuildingHelper.allBuildings)
            {
                if (b == null || b.SpecialService == null) continue;
                var settings = b.SpecialService.settings as Buildings.MarketingAgencySettings;
                if (settings == null || settings.marketingTypesAvailable == null) continue;
                w.BeginObject();
                w.Prop("street", b.StreetName);
                w.Prop("number", b.StreetNumber);
                w.BeginArray("types");
                foreach (var kind in settings.marketingTypesAvailable) w.Value(kind.ToString());
                w.EndArray();
                w.EndObject();
            }
            w.EndArray();
            w.BeginArray("wholesalers");
            foreach (var b in Helpers.BuildingHelper.allBuildings)
            {
                if (b == null || b.SpecialService == null) continue;
                var settings = b.SpecialService.settings as Buildings.WholesaleStoreSettings;
                BuildingRegistration reg;
                if (settings == null || !regs.TryGetValue(Key(b.StreetName, b.StreetNumber), out reg)) continue;
                w.BeginObject();
                w.Prop("street", b.StreetName); w.Prop("number", b.StreetNumber);
                w.Prop("fee", (double)settings.deliveryFee);
                w.BeginArray("products");
                // NPC stock is derived from its layout/season, not cachedAvailableProducts.
                foreach (var product in reg.GetListOfItemsForSale().Distinct().OrderBy(x => x, StringComparer.Ordinal)) w.Value(product);
                w.EndArray(); w.EndObject();
            }
            w.EndArray();
            w.EndObject();
            return w.ToString();
        }

        private static SortedDictionary<string, double> VehiclePrices()
        {
            var prices = new SortedDictionary<string, double>(StringComparer.Ordinal);
            string[] names;
            try
            {
                // Finish enumeration before looking up any types. If the
                // registry cannot be read, retain an explicit empty block:
                // omission would incorrectly permit offline price fallback.
                names = Vehicles.VehicleTypes.VehicleTypeHelper.GetVehicleTypeNames().ToArray();
            }
            catch (Exception) { return prices; }
            foreach (var name in names)
            {
                if (string.IsNullOrEmpty(name)) continue;
                try
                {
                    var vehicle = Vehicles.VehicleTypes.VehicleTypeHelper.GetVehicleType(name);
                    if (vehicle == null) continue;
                    // Match PlayerHelper.GetTotalAssetsWorth: nonmotor vehicles
                    // are known, but do not count toward the bank's asset value.
                    double price = vehicle.IsMotorVehicle ? vehicle.price : 0;
                    if (double.IsNaN(price) || double.IsInfinity(price) || price < 0 || price > 1e12) continue;
                    prices[name] = price;
                }
                catch (Exception) { /* An unreadable type remains unknown to finance. */ }
            }
            // Sorting makes before/after fingerprints independent of registry order.
            return prices;
        }

        internal static bool MarketingSupported()
        {
            var kinds = Enum.GetValues(typeof(Entities.MarketingTypeName)).Cast<Entities.MarketingTypeName>()
                .Where(kind => kind.ToString() != "None").ToArray();
            return kinds.Length == MarketingWrite.TypeNames.Length && kinds.Select((kind, i) =>
                (int)kind == i && kind.ToString() == MarketingWrite.TypeNames[i]).All(ok => ok);
        }

        private static string Key(string street, int number) { return street + "#" + number; }

        internal static string Hash(byte[] bytes)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }

        internal static string Bind(string capture, string stamp, string hash)
        {
            var binding = new JsonWriter();
            binding.BeginObject();
            binding.Prop("stamp", stamp);
            binding.Prop("saveSha256", hash);
            binding.EndObject();
            return capture.Substring(0, capture.Length - 1) + "," + binding.ToString().Substring(1);
        }
    }
}
