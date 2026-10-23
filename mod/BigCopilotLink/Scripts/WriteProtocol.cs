using System;

namespace BigCopilotLink
{
    /// <summary>A status and a JSON body, ready for the listener to send.</summary>
    public struct WriteAnswer
    {
        public readonly int Status;
        public readonly string Json;

        public WriteAnswer(int status, string json)
        {
            Status = status;
            Json = json;
        }

        public static WriteAnswer Error(int status, string error)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", error);
            w.EndObject();
            return new WriteAnswer(status, w.ToString());
        }

        public static WriteAnswer BadRequest(string detail)
        {
            var w = new JsonWriter();
            w.BeginObject();
            w.Prop("error", "bad_request");
            w.Prop("detail", detail);
            w.EndObject();
            return new WriteAnswer(400, w.ToString());
        }
    }

    /// <summary>An address as the wire carries it: the building registration's two fields.</summary>
    public struct WireAddress
    {
        public readonly string Street;
        public readonly int Number;

        public WireAddress(string street, int number)
        {
            Street = street;
            Number = number;
        }

        public bool Is(string street, int number)
        {
            return string.Equals(Street, street, StringComparison.Ordinal) && Number == number;
        }
    }

}
