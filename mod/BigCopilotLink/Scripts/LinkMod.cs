using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using BAModAPI;
using BigAmbitions.Mods;
using UnityEngine;

[assembly: RegisterModClass(typeof(BigCopilotLink.LinkMod))]

namespace BigCopilotLink
{
    /// <summary>
    /// Entry point. [ModEntryOnCityLoad] means the link is up exactly while a city is
    /// loaded — there is nothing to serialize otherwise, and a client that cannot
    /// connect reads that as "the game is not running or no save is loaded".
    ///
    /// This class owns the wiring and the log; the work is in SaveService (when to
    /// serialize and what the bytes are), HealthState (the cached live values) and
    /// LinkHttpServer (the contract).
    /// </summary>
    [ModEntryOnCityLoad]
    public class LinkMod : IModBigAmbitions
    {
        public const string Version = "0.1.0";

        /// <summary>docs/game-link-api.md. Bump on any breaking change.</summary>
        public const int SchemaVersion = 1;

        /// <summary>8321 is Peter's MCP bridge and 8765 the Companion mod, so neither is offered.</summary>
        private static readonly int[] Ports = { 8322, 8323, 8324, 8325 };

        // Localization keys, resolved from Locales/en.json, like every label below.
        private static readonly string[] PortChoices =
        {
            "bigcopilotlink_port_8322", "bigcopilotlink_port_8323",
            "bigcopilotlink_port_8324", "bigcopilotlink_port_8325"
        };

        private const float PumpSeconds = 1f;

        private static IModLogger _logger;
        private static int _mainThreadId;

        private ModContext _context;
        private MainThreadDispatcher _dispatcher;
        private HealthState _health;
        private SaveService _saves;
        private LinkHttpServer _http;

        // Written by the options panel, read by the pump and the listener. Volatile
        // rather than locked: a stale read costs one second, a torn read cannot happen.
        private volatile bool _enabled = true;
        private volatile bool _hourly = true;
        private volatile int _portIndex;

        public string[] RelativeAssetBundlePaths => Array.Empty<string>();

        public Task OnLoadAsync(ModContext context)
        {
            _context = context;
            _logger = context != null ? context.Logger : null;
            _mainThreadId = Thread.CurrentThread.ManagedThreadId;

            _health = new HealthState();
            _saves = new SaveService();

            _dispatcher = MainThreadDispatcher.Install();
            _dispatcher.StartInterval(PumpSeconds, Pump);

            RegisterOptions(context);
            StartListener();

            return Task.CompletedTask;
        }

        public Task OnUnloadAsync()
        {
            StopListener();

            if (_context != null)
            {
                try
                {
                    OptionsService.RemoveModOptions(_context.ModId);
                }
                catch (Exception e)
                {
                    LogError("could not unregister the options panel: " + e.Message);
                }
            }

            if (_dispatcher != null)
            {
                _dispatcher.Uninstall();
                _dispatcher = null;
            }

            if (_saves != null)
            {
                // The bytes are the player's whole company; do not keep them around
                // for a city that is no longer loaded.
                _saves.Clear();
                _saves = null;
            }
            _health = null;

            LogInfo("stopped.");
            _logger = null;
            _context = null;
            return Task.CompletedTask;
        }

        /// <summary>Main thread, once a second.</summary>
        private void Pump()
        {
            _health.RefreshOnMainThread();
            if (_http == null) return; // disabled, or the port was taken
            _saves.PumpOnMainThread(_health.Attached, _hourly);
        }

        // ---- the listener --------------------------------------------------------

        private void StartListener()
        {
            if (_http != null) return;
            if (!_enabled)
            {
                LogInfo("switched off in the options; not listening.");
                return;
            }

            var port = Ports[ClampPortIndex(_portIndex)];
            var server = new LinkHttpServer(port, _saves, _health);
            try
            {
                server.Start();
            }
            catch (Exception e)
            {
                // Most likely the port is taken: a second game instance, the mock, or
                // another mod. Say which port and stay idle rather than retry-looping.
                LogError("could not listen on port " + port.ToString(CultureInfo.InvariantCulture) +
                         " (" + e.Message + "); the link is idle. Pick another port in the mod's options.");
                return;
            }

            _http = server;
            LogInfo("serving the game to Big Copilot on " + server.Url);
        }

        private void StopListener()
        {
            if (_http == null) return;
            _http.Stop();
            _http = null;
        }

        private void RestartListener()
        {
            StopListener();
            StartListener();
        }

        private static int ClampPortIndex(int index)
        {
            if (index < 0) return 0;
            if (index >= Ports.Length) return Ports.Length - 1;
            return index;
        }

        // ---- options -------------------------------------------------------------

        private void RegisterOptions(ModContext context)
        {
            if (context == null) return;

            var options = new ModOptions()
                .AddHeader("bigcopilotlink_options_header")
                .AddToggle("enabled", "bigcopilotlink_enabled_label", _enabled, OnEnabledChanged)
                .AddDropdown("port", "bigcopilotlink_port_label", PortChoices, ClampPortIndex(_portIndex), OnPortChanged)
                .AddToggle("hourly", "bigcopilotlink_hourly_label", _hourly, OnHourlyChanged)
                .AddSplitter()
                .AddButton("bigcopilotlink_copy_label", CopyAddress);

            try
            {
                OptionsService.Register(context.ModId, options);
            }
            catch (Exception e)
            {
                LogError("could not register the options panel: " + e.Message);
            }
        }

        private void OnEnabledChanged(bool value)
        {
            _enabled = value;
            // Options callbacks come from the game's UI, but the listener is only ever
            // touched from the main thread, so go through the dispatcher either way.
            MainThreadDispatcher.Enqueue(RestartListener);
        }

        private void OnPortChanged(int index)
        {
            _portIndex = ClampPortIndex(index);
            MainThreadDispatcher.Enqueue(RestartListener);
        }

        private void OnHourlyChanged(bool value)
        {
            _hourly = value;
        }

        private void CopyAddress()
        {
            var url = "http://127.0.0.1:" +
                      Ports[ClampPortIndex(_portIndex)].ToString(CultureInfo.InvariantCulture) + "/";
            GUIUtility.systemCopyBuffer = url;
            LogInfo("copied " + url + " to the clipboard.");
        }

        // ---- logging -------------------------------------------------------------

        internal static void LogInfo(string message) { Emit(0, message); }
        internal static void LogWarn(string message) { Emit(1, message); }
        internal static void LogError(string message) { Emit(2, message); }

        /// <summary>
        /// The mod logger is only used from the thread that loaded the mod. The HTTP
        /// and pool threads fall back to Debug, which Unity accepts from anywhere.
        /// </summary>
        private static void Emit(int level, string message)
        {
            var text = "[BigCopilotLink] " + message;
            var logger = _logger;
            if (logger != null && Thread.CurrentThread.ManagedThreadId == _mainThreadId)
            {
                if (level == 0) logger.Info(text);
                else if (level == 1) logger.Warn(text);
                else logger.Error(text);
                return;
            }

            if (level == 2) Debug.LogError(text);
            else Debug.Log(text);
        }
    }
}
