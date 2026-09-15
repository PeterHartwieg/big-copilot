<#
.SYNOPSIS
Run Claude Code against Z.ai with a key fetched from 1Password for this process.
.DESCRIPTION
No credentials are written to settings or logs by this launcher. It leaves the
normal Claude provider unchanged. Runs on Windows PowerShell 5.1 and PowerShell 7,
and requires Claude Code and op. The secret reference comes from -SecretReference,
ZAI_API_KEY_REF, or the local ~/.config/agent-cli/zai.json file. The config
contains a reference, never a key.

Saved settings sources are excluded, so the project's CLAUDE.md never reaches the
worker. The working directory's AGENTS.md is appended to the system prompt
instead; -InstructionsFile selects another file and -NoInstructions skips it.
#>
[CmdletBinding(DefaultParameterSetName = 'File')]
param(
    [Parameter(Mandatory, ParameterSetName = 'File')][string]$PromptFile,
    [Parameter(Mandatory, ParameterSetName = 'Text')][string]$Prompt,
    [string]$Model = 'glm-5.3-flash',
    [string]$WorkingDirectory = (Get-Location).Path,
    [string]$SecretReference,
    [string[]]$AddDirectory = @(),
    [string]$Resume,
    [string]$LogPath,
    [string]$InstructionsFile,
    [switch]$NoInstructions,
    [ValidateSet('text', 'json', 'stream-json')][string]$OutputFormat = 'stream-json',
    [switch]$NoTools
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1, and PowerShell 7 before 7.3, rebuild the native command
# line themselves: they drop empty arguments and strip embedded double quotes.
# Empty values therefore travel as --flag=, and every other value is pre-escaped
# so that CommandLineToArgvW reproduces it exactly. Claude Code is reached through
# npm's claude.ps1 shim, which forwards to claude.exe, so this one native boundary
# applies whichever shell started the launcher.
$legacyArgumentPassing = $true
if ($PSVersionTable.PSVersion.Major -ge 6) {
    $argumentPassing = Get-Variable -Name PSNativeCommandArgumentPassing -ValueOnly -ErrorAction SilentlyContinue
    $legacyArgumentPassing = (!$argumentPassing -or $argumentPassing -eq 'Legacy')
}
# Whether the legacy encoder wraps a value in quotes. This is Windows PowerShell
# 5.1's rule, measured against 5.1 rather than assumed: it counts every " as a
# delimiter, including the \" that escaping produces, and wraps only when it finds
# whitespace outside such a run.
#
# PowerShell 7.0-7.2, and 7.3+ set to PSNativeCommandArgumentPassing=Legacy, do not
# count an escaped \", so they wrap some values this returns $false for. The
# launcher then refuses a value those hosts could in fact have passed. That is the
# safe direction to be wrong in: it over-refuses, and never corrupts.
function Test-NativeQuoteWrapping {
    param([string]$Value)
    $quotes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '"') { $quotes++ }
        elseif ([char]::IsWhiteSpace($character) -and ($quotes % 2) -eq 0) { return $true }
    }
    return $false
}
function ConvertTo-NativeArgument {
    param([string]$Value)
    if (!$legacyArgumentPassing -or !$Value) { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    if (Test-NativeQuoteWrapping $escaped) {
        # Trailing backslashes only need doubling inside the wrapping, where they
        # would otherwise escape the closing quote. Doubling them unconditionally
        # would append a stray backslash to an unwrapped value such as C:\repo\.
        return [regex]::Replace($escaped, '(\\+)$', '$1$1')
    }
    if ($Value -match '\s') {
        # Every space sits behind an odd number of quotes, so the encoder leaves the
        # value unwrapped and the space splits it. No escaping can repair that: the
        # only way to flip the encoder's quote tally is to emit another literal
        # quote, which changes the value. Refuse rather than corrupt it silently.
        throw ("PowerShell $($PSVersionTable.PSVersion) cannot pass this value: every space in " +
            'it follows an odd number of double quotes, so the value would be split. ' +
            'Rebalance or remove the quotes, or run the launcher under PowerShell 7.3 or later.')
    }
    return $escaped
}

$claudeCommand = Get-Command claude -ErrorAction Stop
$opCommand = Get-Command op -ErrorAction Stop
$resolvedWork = (Resolve-Path -LiteralPath $WorkingDirectory).Path
if ($PSCmdlet.ParameterSetName -eq 'File') {
    $Prompt = Get-Content -LiteralPath $PromptFile -Raw -Encoding utf8
}
if ([string]::IsNullOrWhiteSpace($Prompt)) { throw 'The prompt is empty.' }
if (!$SecretReference) { $SecretReference = $env:ZAI_API_KEY_REF }
if (!$SecretReference) {
    $configPath = Join-Path $env:USERPROFILE '.config/agent-cli/zai.json'
    if (Test-Path -LiteralPath $configPath) {
        $SecretReference = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).secretReference
    }
}
if (!$SecretReference -or !$SecretReference.StartsWith('op://')) {
    throw 'Set ZAI_API_KEY_REF or ~/.config/agent-cli/zai.json secretReference to an op:// reference.'
}
if ($LogPath) {
    $LogPath = [IO.Path]::GetFullPath($LogPath)
    if (Test-Path -LiteralPath $LogPath) { throw 'LogPath already exists; choose a new file.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($LogPath)) | Out-Null
}

# Excluding the saved settings sources also excludes CLAUDE.md, so the project's
# own instructions are appended explicitly. A missing default is not an error;
# a missing explicit choice is.
$explicitInstructions = $PSCmdlet.MyInvocation.BoundParameters.ContainsKey('InstructionsFile')
if ($NoInstructions -and $explicitInstructions) {
    throw 'Pass either -InstructionsFile or -NoInstructions, not both.'
}
$instructionsArguments = @()
if (!$NoInstructions) {
    $candidate = if ($explicitInstructions) { $InstructionsFile } else { Join-Path $resolvedWork 'AGENTS.md' }
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $instructionsPath = (Resolve-Path -LiteralPath $candidate).Path
        # --append-system-prompt-file is accepted but undocumented outside the
        # --bare summary; it keeps a long file out of the command line, which
        # Windows caps at 32767 characters and the prompt already draws on.
        $helpText = ''
        try { $helpText = (& $claudeCommand.Source --help | Out-String) } catch { $helpText = '' }
        if ($helpText -match 'append-system-prompt-file' -or $helpText -match 'append-system-prompt\[-file\]') {
            $instructionsArguments = @('--append-system-prompt-file', $instructionsPath)
        } else {
            $instructionsArguments = @('--append-system-prompt', (Get-Content -LiteralPath $instructionsPath -Raw -Encoding utf8))
        }
        $instructionsLines = @(Get-Content -LiteralPath $instructionsPath -Encoding utf8).Count
        Write-Host "Instructions: $instructionsPath ($instructionsLines lines)"
    } elseif ($explicitInstructions) {
        $reported = if ([IO.Path]::IsPathRooted($candidate)) { $candidate } else { Join-Path (Get-Location).Path $candidate }
        throw "Instructions file not found: $reported"
    }
}

# Built and encoded before the credential is fetched, so a prompt this shell cannot
# pass refuses the run without touching 1Password. Nothing here needs the credential.
$claudeArguments = @(
    '-p', $Prompt, '--model', $Model,
    '--permission-mode', 'acceptEdits', '--no-chrome',
    '--setting-sources=',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--output-format', $OutputFormat
)
$claudeArguments += $instructionsArguments
if ($NoTools) {
    $claudeArguments += '--tools='
} else {
    $claudeArguments += @('--tools', 'Read,Write,Edit,Glob,Grep,Bash,PowerShell')
    $claudeArguments += @('--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(python *),Bash(node *),Bash(npm test*),Bash(rg *),Bash(ls *),Bash(git status *),Bash(git diff *),PowerShell(Get-Content *),PowerShell(Get-ChildItem *)')
}
if ($OutputFormat -eq 'stream-json') { $claudeArguments += '--verbose' }
if ($Resume) { $claudeArguments += @('--resume', $Resume) }
foreach ($directory in $AddDirectory) {
    $claudeArguments += @('--add-dir', (Resolve-Path -LiteralPath $directory).Path)
}
$claudeArguments = @($claudeArguments | ForEach-Object { ConvertTo-NativeArgument $_ })

# Fixed official endpoint: an arbitrary URL must never receive this credential.
$providerEnvironment = @{
    ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic'
    ANTHROPIC_MODEL = $Model
    ANTHROPIC_DEFAULT_OPUS_MODEL = $Model
    ANTHROPIC_DEFAULT_SONNET_MODEL = $Model
    ANTHROPIC_DEFAULT_HAIKU_MODEL = $Model
    CLAUDE_CODE_SUBAGENT_MODEL = $Model
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    ANTHROPIC_API_KEY = $null
    CLAUDE_CODE_OAUTH_TOKEN = $null
    CLAUDE_CODE_USE_BEDROCK = $null
    CLAUDE_CODE_USE_VERTEX = $null
    CLAUDE_CODE_USE_FOUNDRY = $null
    ANTHROPIC_AUTH_TOKEN = $null
}
$previousEnvironment = @{}
$providerEnvironment.Keys | ForEach-Object {
    $previousEnvironment[$_] = [Environment]::GetEnvironmentVariable($_, 'Process')
}
$zaiCredential = $null
$exitCode = 1
try {
    $zaiCredential = & $opCommand.Source read $SecretReference
    if ($LASTEXITCODE -ne 0 -or !$zaiCredential) { throw '1Password could not read the Z.ai credential.' }
    $providerEnvironment.ANTHROPIC_AUTH_TOKEN = ($zaiCredential -join "`n").Trim()
    foreach ($entry in $providerEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    Push-Location -LiteralPath $resolvedWork
    try {
        if ($LogPath) {
            & $claudeCommand.Source @claudeArguments | Out-File -LiteralPath $LogPath -Encoding utf8
        } else {
            & $claudeCommand.Source @claudeArguments
        }
        $exitCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    $providerEnvironment.ANTHROPIC_AUTH_TOKEN = $null
    $zaiCredential = $null
}
exit $exitCode
