# Check the field names savekeys.py found against the installed game's assemblies.
#
#   powershell -File tools/game_update/dllfields.ps1 -KeysPath <scratch>\keys.json -OutPath <scratch>\fields.txt
#   powershell -File tools/game_update/dllfields.ps1 -KeysPath <scratch>\keys.json -OutPath <scratch>\fields.txt -ManagedDir <Big Ambitions_Data>\Managed
#
# <scratch> is a folder outside the repository.
#
# Loads each $type's assembly from Managed/ by reflection (Windows PowerShell 5.1,
# no dotnet SDK) and writes one tab-separated line per finding:
#   NOFIELD    a field the save holds that the type no longer has: a rename or a
#              removal, and the one that matters
#   NOTYPE     a type the assembly no longer has
#   NOASM      an assembly that is not in Managed/
#   NEWFIELD?  a serializable field the type declares that no save holds yet
#              (informational: most are new, some are just never written)
# System.* types are skipped.
#
# -ManagedDir defaults to the Managed folder beside the en.json that BA_LOCALE
# names. Without BA_LOCALE it tries one place only, the default Steam library
# (Program Files (x86)\Steam\steamapps\common\Big Ambitions), as
# ba_save.find_game_locale() does on Windows; neither searches other Steam
# libraries. For a game installed elsewhere, set BA_LOCALE or pass -ManagedDir.
# See docs/game-update.md.
param(
  [Parameter(Mandatory = $true)][string]$KeysPath,
  [Parameter(Mandatory = $true)][string]$OutPath,
  [string]$ManagedDir
)

if (-not $ManagedDir) {
  if ($env:BA_LOCALE) {
    # <data>\StreamingAssets\locale\en.json -> <data>\Managed
    $data = Split-Path (Split-Path (Split-Path $env:BA_LOCALE -Parent) -Parent) -Parent
    $ManagedDir = Join-Path $data 'Managed'
  } else {
    $ManagedDir = Join-Path ${env:ProgramFiles(x86)} 'Steam\steamapps\common\Big Ambitions\Big Ambitions_Data\Managed'
  }
}
if (-not (Test-Path (Join-Path $ManagedDir 'BigAmbitions.dll'))) {
  throw "no BigAmbitions.dll in $ManagedDir; pass -ManagedDir <Big Ambitions_Data>\Managed"
}

$m = $ManagedDir
$json = Get-Content $KeysPath -Raw | ConvertFrom-Json
$asms = @{}
$flags = [Reflection.BindingFlags]'Public,NonPublic,Instance'
$out = New-Object System.Collections.Generic.List[string]
foreach ($prop in $json.typed.PSObject.Properties) {
  $full = $prop.Name
  if ($full -like 'System.*') { continue }
  $i = $full.LastIndexOf(', ')
  $tn = $full.Substring(0, $i); $an = $full.Substring($i + 2)
  if (-not $asms.ContainsKey($an)) {
    $p = Join-Path $m "$an.dll"
    if (Test-Path $p) { $asms[$an] = [Reflection.Assembly]::LoadFrom($p) } else { $asms[$an] = $null }
  }
  $asm = $asms[$an]
  if (-not $asm) { $out.Add("NOASM`t$full"); continue }
  $t = $null
  try { $t = $asm.GetType($tn, $false) } catch { }
  if (-not $t) { $out.Add("NOTYPE`t$full"); continue }
  $names = New-Object 'System.Collections.Generic.HashSet[string]'
  $cur = $t
  while ($cur) {
    try { foreach ($f in $cur.GetFields($flags)) { [void]$names.Add($f.Name) } } catch { }
    try { foreach ($pp in $cur.GetProperties($flags)) { [void]$names.Add($pp.Name) } } catch { }
    try { $cur = $cur.BaseType } catch { $cur = $null }
  }
  foreach ($k in $prop.Value) {
    if (-not $names.Contains($k)) { $out.Add("NOFIELD`t$full`t$k") }
  }
  # New fields the save does not have yet (informational).
  $saved = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($k in $prop.Value) { [void]$saved.Add($k) }
  try { foreach ($f in $t.GetFields([Reflection.BindingFlags]'Public,NonPublic,Instance,DeclaredOnly')) { if (-not $f.IsNotSerialized -and -not $f.Name.Contains('<') -and -not $saved.Contains($f.Name)) { $out.Add("NEWFIELD?`t$full`t$($f.Name):$($f.FieldType.Name)") } } } catch { }
}
# UTF-8 without a byte order mark, so a grep for ^NOFIELD also sees line one.
$full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutPath)
[IO.File]::WriteAllLines($full, [string[]]$out, (New-Object System.Text.UTF8Encoding $false))
"done: $($out.Count) lines"
