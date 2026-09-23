using System;
using System.Security.Cryptography;

namespace BigCopilotLink
{
    /// <summary>
    /// The code a page must send before it may change the game (docs/game-link-api.md,
    /// "Writes"). Drawn once per game launch: the field is static and the mod's assembly
    /// stays loaded across city loads, so a reload keeps it and a restart replaces it.
    /// Reads never need it; the origin allowlist and the browser's prompt guard those.
    /// </summary>
    public static class PairingCode
    {
        /// <summary>No 0/O, 1/I/L: the code is read off the screen and typed by hand.</summary>
        private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        private const int Length = 6;

        public static readonly string Code = Draw();

        private static string Draw()
        {
            var chars = new char[Length];
            var one = new byte[1];
            using (var rng = RandomNumberGenerator.Create())
            {
                // Rejection sampling: 248 is the largest multiple of 31 below 256, so every
                // letter is equally likely.
                var limit = 256 - 256 % Alphabet.Length;
                for (var i = 0; i < Length;)
                {
                    rng.GetBytes(one);
                    if (one[0] >= limit) continue;
                    chars[i++] = Alphabet[one[0] % Alphabet.Length];
                }
            }
            return new string(chars);
        }

        /// <summary>
        /// True when the Authorization header is "Bearer &lt;the code&gt;". Any thread. The
        /// compare takes the same time whatever it finds, so the answer's timing says
        /// nothing about how many characters were right. Letters are compared in upper
        /// case: the alphabet has no lower case, and a player may type the code in it.
        /// </summary>
        public static bool Matches(string authorization)
        {
            if (authorization == null) return false;
            var text = authorization.Trim();
            const string scheme = "Bearer ";
            if (text.Length < scheme.Length ||
                !string.Equals(text.Substring(0, scheme.Length), scheme, StringComparison.OrdinalIgnoreCase))
                return false;
            var given = text.Substring(scheme.Length).Trim().ToUpperInvariant();

            var diff = given.Length ^ Code.Length;
            for (var i = 0; i < Code.Length; i++)
            {
                var g = i < given.Length ? given[i] : '\0';
                diff |= g ^ Code[i];
            }
            return diff == 0;
        }
    }
}
