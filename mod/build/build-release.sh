#!/usr/bin/env bash
# Build only. No installation or Workshop upload.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SDK="${BA_SDK:-$REPO/build/sdk}"
UNITY="${UNITY:-/Applications/Unity/Hub/Editor/2022.3.62f2/Unity.app/Contents/MacOS/Unity}"
PIN=1e03ddd5071b77a32cfd8bba89f0c130ba6c7d73
mkdir -p "$REPO/build"
[ -x "$UNITY" ] || { echo "Unity not found: $UNITY" >&2; exit 1; }
if [ ! -d "$SDK/.git" ]; then
  git clone -q https://github.com/hovgaardgames/bigambitions.git "$SDK"
  git -C "$SDK" checkout -q "$PIN"
fi
[ "$(git -C "$SDK" rev-parse HEAD)" = "$PIN" ] || { echo "SDK is not at $PIN" >&2; exit 1; }
link() {
  if [ -L "$2" ]; then
    [ "$(readlink "$2")" = "$1" ] || { echo "Unexpected link: $2" >&2; exit 1; }
  elif [ -e "$2" ]; then
    echo "Refusing to replace $2" >&2; exit 1
  else ln -s "$1" "$2"; fi
}
link "$REPO/mod/BigCopilotLink" "$SDK/Assets/Mods/BigCopilotLink"
mkdir -p "$SDK/Assets/Editor/BclBatch"
cp "$REPO/mod/build/BclBatch.cs" "$REPO/mod/build/BclBatch.Editor.asmdef" "$SDK/Assets/Editor/BclBatch/"
# Bootstrap explicit game references before Unity can compile GameDllImporter.
GAME_DLLS="${BA_GAME_DLLS:-$HOME/Library/Application Support/BigCopilotLink/dll-shim/Big Ambitions_Data/Managed}"
python3 - "$REPO" "$GAME_DLLS" "$SDK/Assets/_BaDependencies/GameDlls" <<'PYBOOT'
import json, pathlib, shutil, sys
repo, source, target = map(pathlib.Path, sys.argv[1:])
names = json.loads((repo/'mod/BigCopilotLink/BigCopilotLink.asmdef').read_text())['precompiledReferences']
missing = [name for name in names if not (source/name).is_file()]
if missing: raise SystemExit('Missing game references: '+', '.join(missing))
target.mkdir(parents=True, exist_ok=True)
for name in names: shutil.copy2(source/name, target/name)
PYBOOT
python3 "$REPO/mod/build/write-dll-metas.py" "$SDK/Assets/_BaDependencies/GameDlls"
"$UNITY" -batchmode -nographics -projectPath "$SDK" -executeMethod BclBatch.Run -logFile "$REPO/build/unity-release.log"
python3 - "$REPO" "$SDK" <<'PY'
import hashlib, pathlib, re, shutil, sys, zipfile
repo, sdk = map(pathlib.Path, sys.argv[1:])
manifest = (repo/'mod/BigCopilotLink/ModManifest.asset').read_text()
version = re.search(r'^  Version: (\S+)$', manifest, re.M)[1]
source = (repo/'mod/BigCopilotLink/Scripts/LinkMod.cs').read_text()
if re.search(r'const string Version = "([^"]+)"', source)[1] != version:
    raise SystemExit('Manifest and runtime version differ')
out = repo/'build/BigCopilotLink'
if out.exists(): shutil.rmtree(out)
shutil.copytree(sdk/'Output/BigCopilotLink', out)
shutil.copy2(repo/'mod/BigCopilotLink/README.md', out/'README.md')
shutil.copy2(repo/'mod/workshop/thumbnail.png', out/'thumbnail.png')
files = sorted(p for p in out.rglob('*') if p.is_file())
if {p.relative_to(out).as_posix() for p in files} != {'BigCopilotLink.dll','Locales/en.json','README.md','thumbnail.png'}:
    raise SystemExit('Unexpected SDK package contents; inspect before release')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
(repo/'build/BigCopilotLink.sha256').write_text(''.join(f'{sha(p)}  {p.relative_to(out).as_posix()}\n' for p in files))
archive = repo/'build'/f'BigCopilotLink-{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files: z.write(p, 'BigCopilotLink/'+p.relative_to(out).as_posix())
archive.with_suffix('.zip.sha256').write_text(f'{sha(archive)}  {archive.name}\n')
print(f'Built {archive}\nSHA256 {sha(archive)}')
PY
