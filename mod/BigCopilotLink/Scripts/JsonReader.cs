using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>A request the mod cannot read: answered 400 bad_request with this detail.</summary>
    public sealed class BadRequestException : Exception
    {
        public BadRequestException(string detail) : base(detail) { }
    }

    /// <summary>
    /// Minimal JSON reader, the counterpart of JsonWriter: enough for the write bodies in
    /// docs/game-link-api.md. Unity's JsonUtility cannot read their nested shapes. The tree
    /// is Dictionary&lt;string, object&gt;, List&lt;object&gt;, double, string, bool or null;
    /// the typed accessors below turn a wrong shape into a bad_request detail that names
    /// the field. Runs on the HTTP threads: it touches nothing of the game.
    /// </summary>
    public static class JsonReader
    {
        // A body is at most 256 KiB, but nesting is what would blow the stack.
        private const int MaxDepth = 32;

        public static object Parse(string text)
        {
            var pos = 0;
            var value = ReadValue(text, ref pos, 0);
            SkipSpace(text, ref pos);
            if (pos != text.Length) throw Fail("trailing characters", pos);
            return value;
        }

        // ---- typed access ----------------------------------------------------------

        public static Dictionary<string, object> Obj(object value, string path)
        {
            var obj = value as Dictionary<string, object>;
            if (obj == null) throw new BadRequestException(path + " must be an object");
            return obj;
        }

        public static List<object> Arr(object value, string path)
        {
            var arr = value as List<object>;
            if (arr == null) throw new BadRequestException(path + " must be an array");
            return arr;
        }

        /// <summary>The field, or null when it is missing or null.</summary>
        public static object Get(Dictionary<string, object> obj, string key)
        {
            object value;
            return obj.TryGetValue(key, out value) ? value : null;
        }

        public static string Str(Dictionary<string, object> obj, string key, string path, bool required)
        {
            var value = Get(obj, key);
            if (value == null)
            {
                if (required) throw new BadRequestException(path + "." + key + " is required");
                return null;
            }
            var s = value as string;
            if (s == null) throw new BadRequestException(path + "." + key + " must be a string");
            return s;
        }

        public static bool Bool(Dictionary<string, object> obj, string key, string path, bool fallback)
        {
            var value = Get(obj, key);
            if (value == null) return fallback;
            if (!(value is bool)) throw new BadRequestException(path + "." + key + " must be true or false");
            return (bool)value;
        }

        /// <summary>A number as sent: whether it is whole is the caller's rule, not a parse error.</summary>
        public static double Num(Dictionary<string, object> obj, string key, string path)
        {
            var value = Get(obj, key);
            if (!(value is double)) throw new BadRequestException(path + "." + key + " must be a number");
            return (double)value;
        }

        public static bool IsWhole(double value, int min, int max)
        {
            return value >= min && value <= max && Math.Floor(value) == value;
        }

        /// <summary>An array field, empty when missing or null.</summary>
        public static List<object> OptArr(Dictionary<string, object> obj, string key, string path)
        {
            var value = Get(obj, key);
            return value == null ? new List<object>() : Arr(value, path + "." + key);
        }

        // ---- parsing ---------------------------------------------------------------

        private static object ReadValue(string s, ref int pos, int depth)
        {
            if (depth > MaxDepth) throw Fail("nested too deeply", pos);
            SkipSpace(s, ref pos);
            if (pos >= s.Length) throw Fail("unexpected end", pos);
            var c = s[pos];
            if (c == '{') return ReadObject(s, ref pos, depth);
            if (c == '[') return ReadArray(s, ref pos, depth);
            if (c == '"') return ReadString(s, ref pos);
            if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber(s, ref pos);
            if (Match(s, ref pos, "true")) return true;
            if (Match(s, ref pos, "false")) return false;
            if (Match(s, ref pos, "null")) return null;
            throw Fail("unexpected character", pos);
        }

        private static Dictionary<string, object> ReadObject(string s, ref int pos, int depth)
        {
            var obj = new Dictionary<string, object>(StringComparer.Ordinal);
            pos++; // {
            SkipSpace(s, ref pos);
            if (pos < s.Length && s[pos] == '}') { pos++; return obj; }
            while (true)
            {
                SkipSpace(s, ref pos);
                if (pos >= s.Length || s[pos] != '"') throw Fail("expected a key", pos);
                var key = ReadString(s, ref pos);
                SkipSpace(s, ref pos);
                if (pos >= s.Length || s[pos] != ':') throw Fail("expected ':'", pos);
                pos++;
                // A repeated key keeps the last value, as JavaScript's JSON.parse does.
                obj[key] = ReadValue(s, ref pos, depth + 1);
                SkipSpace(s, ref pos);
                if (pos >= s.Length) throw Fail("unexpected end", pos);
                if (s[pos] == ',') { pos++; continue; }
                if (s[pos] == '}') { pos++; return obj; }
                throw Fail("expected ',' or '}'", pos);
            }
        }

        private static List<object> ReadArray(string s, ref int pos, int depth)
        {
            var arr = new List<object>();
            pos++; // [
            SkipSpace(s, ref pos);
            if (pos < s.Length && s[pos] == ']') { pos++; return arr; }
            while (true)
            {
                arr.Add(ReadValue(s, ref pos, depth + 1));
                SkipSpace(s, ref pos);
                if (pos >= s.Length) throw Fail("unexpected end", pos);
                if (s[pos] == ',') { pos++; continue; }
                if (s[pos] == ']') { pos++; return arr; }
                throw Fail("expected ',' or ']'", pos);
            }
        }

        private static string ReadString(string s, ref int pos)
        {
            var sb = new StringBuilder();
            pos++; // opening quote
            while (pos < s.Length)
            {
                var c = s[pos++];
                if (c == '"') return sb.ToString();
                if (c < 0x20) throw Fail("control character in a string", pos - 1);
                if (c != '\\') { sb.Append(c); continue; }
                if (pos >= s.Length) break;
                var e = s[pos++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        int code;
                        if (pos + 4 > s.Length ||
                            !int.TryParse(s.Substring(pos, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out code))
                            throw Fail("bad \\u escape", pos);
                        sb.Append((char)code);
                        pos += 4;
                        break;
                    default:
                        throw Fail("bad escape", pos - 1);
                }
            }
            throw Fail("unterminated string", pos);
        }

        private static double ReadNumber(string s, ref int pos)
        {
            // RFC 8259's grammar first: -?(0|[1-9][0-9]*)(.[0-9]+)?([eE][+-]?[0-9]+)?.
            // double.TryParse alone would take 01, 1., .5 and +1.
            var start = pos;
            if (pos < s.Length && s[pos] == '-') pos++;
            if (pos < s.Length && s[pos] == '0') pos++;
            else if (pos < s.Length && s[pos] >= '1' && s[pos] <= '9') SkipDigits(s, ref pos);
            else throw Fail("bad number", start);
            if (pos < s.Length && s[pos] == '.')
            {
                pos++;
                if (!SkipDigits(s, ref pos)) throw Fail("bad number", start);
            }
            if (pos < s.Length && (s[pos] == 'e' || s[pos] == 'E'))
            {
                pos++;
                if (pos < s.Length && (s[pos] == '+' || s[pos] == '-')) pos++;
                if (!SkipDigits(s, ref pos)) throw Fail("bad number", start);
            }
            // A digit or sign straight after is not a separator: "01", "1.5.2", "1-2".
            if (pos < s.Length && "0123456789.eE+-".IndexOf(s[pos]) >= 0) throw Fail("bad number", start);
            double value;
            if (!double.TryParse(s.Substring(start, pos - start), NumberStyles.Float, CultureInfo.InvariantCulture, out value) ||
                double.IsNaN(value) || double.IsInfinity(value))
                throw Fail("bad number", start);
            return value;
        }

        /// <summary>At least one digit, skipped.</summary>
        private static bool SkipDigits(string s, ref int pos)
        {
            var start = pos;
            while (pos < s.Length && s[pos] >= '0' && s[pos] <= '9') pos++;
            return pos > start;
        }

        private static bool Match(string s, ref int pos, string word)
        {
            if (pos + word.Length > s.Length || string.CompareOrdinal(s, pos, word, 0, word.Length) != 0) return false;
            pos += word.Length;
            return true;
        }

        private static void SkipSpace(string s, ref int pos)
        {
            while (pos < s.Length && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\n' || s[pos] == '\r')) pos++;
        }

        private static BadRequestException Fail(string what, int pos)
        {
            return new BadRequestException("not JSON: " + what + " at " + pos.ToString(CultureInfo.InvariantCulture));
        }
    }
}
