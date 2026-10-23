#!/usr/bin/env python3
"""Writes Unity .meta files for the game DLLs in an SDK clone, as the SDK's GameDllImporter would.

Deterministic GUIDs (MD5 of "BAModTemplate.GameDllGuid:<lowercase file name>") keep the SDK's example
assets resolvable; isExplicitlyReferenced stops the game DLLs leaking into Unity's own packages
(the game's global PlayerPrefs type breaks them otherwise). Usage: write-dll-metas.py <GameDlls folder>
"""
import hashlib
import pathlib
import sys

TEMPLATE = """fileFormatVersion: 2
guid: {guid}
PluginImporter:
  externalObjects: {{}}
  serializedVersion: 2
  iconMap: {{}}
  executionOrder: {{}}
  defineConstraints: []
  isPreloaded: 0
  isOverridable: 0
  isExplicitlyReferenced: 1
  validateReferences: 0
  platformData:
  - first:
      Any: 
    second:
      enabled: 0
      settings: {{}}
  - first:
      Editor: Editor
    second:
      enabled: 1
      settings:
        DefaultValueInitialized: true
  - first:
      Standalone: Linux64
    second:
      enabled: 1
      settings: {{}}
  - first:
      Standalone: OSXUniversal
    second:
      enabled: 1
      settings: {{}}
  - first:
      Standalone: Win
    second:
      enabled: 1
      settings: {{}}
  - first:
      Standalone: Win64
    second:
      enabled: 1
      settings: {{}}
  - first:
      Windows Store Apps: WindowsStoreApps
    second:
      enabled: 0
      settings:
        CPU: AnyCPU
  userData: 
  assetBundleName: 
  assetBundleVariant: 
"""

folder = pathlib.Path(sys.argv[1])
changed = 0
for dll in sorted(folder.glob("*.dll")):
    guid = hashlib.md5(("BAModTemplate.GameDllGuid:" + dll.name.lower()).encode()).hexdigest()
    meta = dll.with_name(dll.name + ".meta")
    text = TEMPLATE.format(guid=guid)
    if not meta.exists() or meta.read_text() != text:
        meta.write_text(text)
        changed += 1
print(f"{changed} DLL meta files written")
