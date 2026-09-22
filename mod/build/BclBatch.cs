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
        GameDllImporter.Import(shim);
        Debug.Log("[BclBatch] dll status " + GameDllImporter.GetStatus().State);

        var manifestPath = ModFolder + "/ModManifest.asset";
        var manifest = AssetDatabase.LoadAssetAtPath<BAModManifest>(manifestPath);
        if (manifest == null)
        {
            manifest = ScriptableObject.CreateInstance<BAModManifest>();
            manifest.ModId = "BigCopilotLink";
            manifest.DisplayName = "Big Copilot Link";
            manifest.Author = "Peter Hartwieg";
            manifest.Version = "0.1.0";
            manifest.ModAssembly = AssetDatabase.LoadAssetAtPath<AssemblyDefinitionAsset>(ModFolder + "/BigCopilotLink.asmdef");
            manifest.LocalesFolder = AssetDatabase.LoadAssetAtPath<DefaultAsset>(ModFolder + "/Locales");
            AssetDatabase.CreateAsset(manifest, manifestPath);
            AssetDatabase.SaveAssets();
            Debug.Log("[BclBatch] created manifest; asmdef=" + (manifest.ModAssembly != null) + " locales=" + (manifest.LocalesFolder != null));
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
        ModPackager.Enqueue(mod, installAfterBuild: true);
    }
}
