<#
.SYNOPSIS
Run Claude Code against Z.ai with a key fetched from 1Password for this process.
.DESCRIPTION
No credentials are written to settings or logs by this launcher. It leaves the
normal Claude provider unchanged. Requires PowerShell 7, Claude Code and op.
The secret reference comes from -SecretReference, ZAI_API_KEY_REF, or the local
~/.config/agent-cli/zai.json file. The config contains a reference, never a key.
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
    [ValidateSet('text', 'json', 'stream-json')][string]$OutputFormat = 'stream-json',
    [switch]$NoTools
)

$ErrorActionPreference = 'Stop'
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
    $claudeArguments = @(
        '-p', $Prompt, '--model', $Model,
        '--permission-mode', 'acceptEdits', '--no-chrome',
        '--setting-sources', '',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--output-format', $OutputFormat
    )
    if ($NoTools) {
        $claudeArguments += @('--tools', '')
    } else {
        $claudeArguments += @('--tools', 'Read,Write,Edit,Glob,Grep,Bash,PowerShell')
        $claudeArguments += @('--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(python *),Bash(node *),Bash(npm test*),Bash(rg *),Bash(ls *),Bash(git status *),Bash(git diff *),PowerShell(Get-Content *),PowerShell(Get-ChildItem *)')
    }
    if ($OutputFormat -eq 'stream-json') { $claudeArguments += '--verbose' }
    if ($Resume) { $claudeArguments += @('--resume', $Resume) }
    foreach ($directory in $AddDirectory) {
        $claudeArguments += @('--add-dir', (Resolve-Path -LiteralPath $directory).Path)
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
