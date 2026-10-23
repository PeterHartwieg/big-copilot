using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditorInternal;
using UnityEngine;
using BAModTemplate.Editor;

public static class BclBatch
{
    const string ModFolder = "Assets/Mods/BigCopilotLink";

    public static void Run()
    {
        var shim = Path.Combine(System.Environment.GetEnvironmentVariable("HOME"),
            "Library/Application Support/BigCopilotLink/dll-shim");
        Debug.Log("[BclBatch] importing from " + shim);
        if (string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("BA_GAME_DLLS")))
            GameDllImporter.Import(shim);
        Debug.Log("[BclBatch] dll status " + GameDllImporter.GetStatus().State);

        var manifestPath = ModFolder + "/ModManifest.asset";
        var manifest = AssetDatabase.LoadAssetAtPath<BAModManifest>(manifestPath);
        if (manifest == null)
        {
            Debug.LogError("[BclBatch] Missing committed ModManifest.asset; refusing to invent a release version.");
            EditorApplication.Exit(2);
            return;
        }

        var mod = ModDiscovery.DiscoverFor(manifest);
        if (mod == null) { Debug.LogError("[BclBatch] mod not discovered"); EditorApplication.Exit(2); return; }

        foreach (var issue in ModValidator.Validate(mod, ModDiscovery.DiscoverAll()))
            Debug.Log("[BclBatch] validate: " + issue.Severity + " " + issue.Message);

        Debug.Log("[BclBatch] ModsLocal root " + ModInstaller.GetModsLocalRoot());
        ModPackager.JobChanged += job =>
        {
            Debug.Log("[BclBatch] job " + job.State + ": " + job.StatusText);
            if (!job.IsTerminal) return;
            foreach (var m in job.CompilerMessages) Debug.Log("[BclBatch] compiler " + m.type + ": " + m.message);
            foreach (var l in job.Log) Debug.Log("[BclBatch] log " + l);
            Debug.Log("[BclBatch] output " + job.OutputDirectoryAbsolute);
            EditorApplication.Exit(job.State == BuildState.Done ? 0 : 1);
        };
        ModPackager.Enqueue(mod, installAfterBuild: false);
    }
}
