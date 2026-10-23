using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BigCopilotLink;

// Test-only interpreter of the keywords in the vendored frozen request schema.
// No validator or schema is shipped in the runtime mod.
internal static class OwnershipSchemaCheck
{
    static Dictionary<string, object> schema;
    internal static void Request(string raw)
    {
        if (schema == null)
        {
            var path = Environment.GetEnvironmentVariable("BCL_OWNERSHIP_SCHEMA");
            if (string.IsNullOrEmpty(path)) throw new Exception("Set BCL_OWNERSHIP_SCHEMA to contracts/rlo/ownership-request.schema.json");
            schema = JsonReader.Obj(JsonReader.Parse(File.ReadAllText(path)), "schema");
        }
        if (!Matches(JsonReader.Parse(raw), schema)) throw new Exception("Ownership request violates frozen schema: " + raw);
    }
    static bool Matches(object value, Dictionary<string, object> rule)
    {
        object x;
        if (rule.TryGetValue("oneOf", out x) && ((List<object>)x).Count(r => Matches(value,(Dictionary<string,object>)r)) != 1) return false;
        if (rule.TryGetValue("anyOf", out x) && !((List<object>)x).Any(r => Matches(value,(Dictionary<string,object>)r))) return false;
        if (rule.TryGetValue("allOf", out x) && !((List<object>)x).All(r => Matches(value,(Dictionary<string,object>)r))) return false;
        if (rule.TryGetValue("if", out x) && Matches(value,(Dictionary<string,object>)x) && rule.ContainsKey("then") && !Matches(value,(Dictionary<string,object>)rule["then"])) return false;
        if (rule.TryGetValue("const", out x) && !Equals(value,x)) return false;
        if (rule.TryGetValue("enum", out x) && !((List<object>)x).Any(v=>Equals(value,v))) return false;
        if (rule.TryGetValue("type", out x))
        {
            var type=(string)x;
            if (type=="object" && !(value is Dictionary<string,object>) || type=="array" && !(value is List<object>)
                || type=="string" && !(value is string) || type=="boolean" && !(value is bool)
                || type=="null" && value!=null || type=="integer" && (!(value is double) || (double)value!=Math.Floor((double)value))) return false;
        }
        if (value is double)
        {
            if (rule.TryGetValue("minimum",out x) && (double)value<(double)x) return false;
            if (rule.TryGetValue("maximum",out x) && (double)value>(double)x) return false;
        }
        if (value is string)
        {
            if (rule.TryGetValue("minLength",out x) && ((string)value).Length<(double)x) return false;
            if (rule.TryGetValue("maxLength",out x) && ((string)value).Length>(double)x) return false;
        }
        var list=value as List<object>;
        if (list!=null)
        {
            if (rule.TryGetValue("minItems",out x) && list.Count<(double)x || rule.TryGetValue("maxItems",out x) && list.Count>(double)x) return false;
            if (rule.TryGetValue("items",out x) && !list.All(v=>Matches(v,(Dictionary<string,object>)x))) return false;
        }
        var obj=value as Dictionary<string,object>;
        if (obj!=null)
        {
            if (rule.TryGetValue("required",out x) && !((List<object>)x).All(k=>obj.ContainsKey((string)k))) return false;
            var properties=rule.ContainsKey("properties") ? (Dictionary<string,object>)rule["properties"] : new Dictionary<string,object>();
            if (rule.TryGetValue("additionalProperties",out x) && x is bool && !(bool)x && obj.Keys.Any(k=>!properties.ContainsKey(k))) return false;
            if (properties.Any(p=>obj.ContainsKey(p.Key) && !Matches(obj[p.Key],(Dictionary<string,object>)p.Value))) return false;
        }
        return true;
    }
}
