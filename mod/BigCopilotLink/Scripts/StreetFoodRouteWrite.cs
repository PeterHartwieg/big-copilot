using System;
using System.Collections.Generic;

namespace BigCopilotLink
{
    /// <summary>Optional route adapter. The Street Food provider owns validation and mutation.</summary>
    public static class StreetFoodRouteWrite
    {
        public sealed class Request { public string Json, Character, Company; }

        public static Request Parse(Dictionary<string, object> root, string json)
        {
            var expect = JsonReader.Obj(JsonReader.Get(root, "expect"), "body.expect");
            var req = new Request { Json = json,
                Character = JsonReader.Str(expect, "character", "body.expect", true),
                Company = JsonReader.Str(expect, "company", "body.expect", true) };
            if (string.IsNullOrEmpty(req.Character) || string.IsNullOrEmpty(req.Company))
                throw new BadRequestException("expect.character and expect.company must not be empty");
            JsonReader.Str(root, "vehicleId", "body", true);
            JsonReader.Str(root, "revision", "body", true);
            var day = JsonReader.Num(root, "weekday", "body");
            if (!JsonReader.IsWhole(day, 0, 6)) throw new BadRequestException("weekday must be Monday=0 through Sunday=6");
            var stops = JsonReader.Arr(JsonReader.Get(root, "stops"), "body.stops");
            if (stops.Count > 6) throw new BadRequestException("at most six stops per day");
            foreach (var value in stops)
            {
                var row = JsonReader.Obj(value, "body.stops[]");
                foreach (var key in new[] { "x", "z" })
                    if (Math.Abs(JsonReader.Num(row, key, "body.stops[]")) > 1000000) throw new BadRequestException("invalid position");
                foreach (var key in new[] { "open", "close" })
                    if (!JsonReader.IsWhole(JsonReader.Num(row, key, "body.stops[]"), 0, 1620)) throw new BadRequestException("invalid time");
            }
            return req;
        }

        public static WriteAnswer Run(WriteService ws, Request req, bool dryRun)
        {
            var game = SaveGameManager.Current;
            if (req.Character != (game.characterId ?? "") || req.Company != (game.SaveGameName ?? ""))
                return WriteAnswer.Error(409, "changed");
            var method = StreetFoodSnapshot.RouteMethod();
            if (method == null) return WriteAnswer.Error(409, "unavailable");
            var answer = method.Invoke(null, new object[] { game, req.Json, dryRun }) as string;
            if (answer == null || answer.Length > 256 * 1024) return WriteAnswer.Error(409, "unavailable");
            var parsed = JsonReader.Obj(JsonReader.Parse(answer), "provider");
            if (!JsonReader.Bool(parsed, "ok", "provider", false)) return new WriteAnswer(409, answer);
            if (!dryRun)
            {
                var stamp = ws.Applied("bigcopilotlink_notify_street_food_route", game.SaveGameName);
                var w = new JsonWriter(); w.BeginObject(); w.Prop("stamp", stamp); w.EndObject();
                // Both are validated objects. Preserve the provider's reviewed route rows.
                answer = answer.TrimEnd();
                answer = answer.Substring(0, answer.Length - 1) + "," + w.ToString().Substring(1);
            }
            return new WriteAnswer(200, answer);
        }
    }
}
