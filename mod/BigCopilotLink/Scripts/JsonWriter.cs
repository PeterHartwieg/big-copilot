using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BigCopilotLink
{
    /// <summary>
    /// Minimal JSON writer so the mod needs no external serializer inside Unity.
    /// Not general purpose — just enough for the handful of small objects in
    /// docs/game-link-api.md. Comma placement is tracked per nesting level;
    /// callers pair Begin*/End* like brackets.
    /// </summary>
    public sealed class JsonWriter
    {
        private readonly StringBuilder _sb = new StringBuilder(512);
        private readonly Stack<bool> _needComma = new Stack<bool>();

        public JsonWriter()
        {
            _needComma.Push(false);
        }

        public void BeginObject() { StartItem(); Open('{'); }
        public void BeginObject(string key) { WriteKey(key); Open('{'); }
        public void EndObject() { Close('}'); }

        public void BeginArray() { StartItem(); Open('['); }
        public void BeginArray(string key) { WriteKey(key); Open('['); }
        public void EndArray() { Close(']'); }

        public void Prop(string key, string value) { WriteKey(key); WriteString(value); }
        public void Prop(string key, bool value) { WriteKey(key); _sb.Append(value ? "true" : "false"); }
        public void Prop(string key, int value) { WriteKey(key); _sb.Append(value.ToString(CultureInfo.InvariantCulture)); }
        public void Prop(string key, double value) { WriteKey(key); WriteNumber(value); }
        public void PropNull(string key) { WriteKey(key); _sb.Append("null"); }

        /// <summary>
        /// A game float. Widening a float to double exposes its binary error
        /// (0.1f becomes 0.10000000149011612), so round to four places first —
        /// these are cash and clock values for a ticker, not accounting.
        /// </summary>
        public void PropFloat(string key, float value)
        {
            WriteKey(key);
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                _sb.Append("null");
                return;
            }
            WriteNumber(Math.Round((double)value, 4));
        }

        public void Value(string value) { StartItem(); WriteString(value); }

        public override string ToString()
        {
            return _sb.ToString();
        }

        private void Open(char bracket)
        {
            _sb.Append(bracket);
            _needComma.Push(false);
        }

        private void Close(char bracket)
        {
            _needComma.Pop();
            _sb.Append(bracket);
        }

        private void WriteKey(string key)
        {
            StartItem();
            WriteString(key);
            _sb.Append(':');
        }

        private void StartItem()
        {
            if (_needComma.Peek()) _sb.Append(',');
            _needComma.Pop();
            _needComma.Push(true);
        }

        private void WriteNumber(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                _sb.Append("null");
                return;
            }
            _sb.Append(value.ToString("R", CultureInfo.InvariantCulture));
        }

        private void WriteString(string value)
        {
            if (value == null)
            {
                _sb.Append("null");
                return;
            }

            _sb.Append('"');
            foreach (var ch in value)
            {
                switch (ch)
                {
                    case '"': _sb.Append("\\\""); break;
                    case '\\': _sb.Append("\\\\"); break;
                    case '\n': _sb.Append("\\n"); break;
                    case '\r': _sb.Append("\\r"); break;
                    case '\t': _sb.Append("\\t"); break;
                    case '\b': _sb.Append("\\b"); break;
                    case '\f': _sb.Append("\\f"); break;
                    default:
                        if (ch < 0x20)
                            _sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
                        else
                            _sb.Append(ch);
                        break;
                }
            }
            _sb.Append('"');
        }
    }
}
