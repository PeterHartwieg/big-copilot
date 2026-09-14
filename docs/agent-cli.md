# CLI agents

Use a CLI agent only when delegation is requested. Give each concurrent agent
explicit file ownership, preserve existing changes, and inspect its actual model
metadata and results. Do not impose execution timeouts or terminate agents solely
because of elapsed time. Do not commit or deploy without task authorization.

## GLM through Claude Code and Z.ai

The maintained launcher is [Invoke-ZaiClaude.ps1](../tools/Invoke-ZaiClaude.ps1).
A reusable installed copy is at
`$env:USERPROFILE/.config/agent-cli/Invoke-ZaiClaude.ps1` on Peter's machine.
Its default model is `glm-5.3-flash`. A live no-tools smoke test on 2026-09-13
returned READY and reported `glm-5.3-flash` in Claude Code's `modelUsage`.

```powershell
pwsh -NoProfile -File tools/Invoke-ZaiClaude.ps1 -PromptFile research/my-task.md -LogPath research/my-agent.jsonl
```

From any project, use the installed copy and pass that project's directory:

```powershell
pwsh -NoProfile -File "$env:USERPROFILE/.config/agent-cli/Invoke-ZaiClaude.ps1" -WorkingDirectory (Get-Location).Path -PromptFile ./task.md -LogPath ./agent-run.jsonl
```

Optional parameters: `-Model`, `-AddDirectory` (explicit authorized read locations),
`-Resume` (Claude session UUID), `-OutputFormat text|json|stream-json`, and
`-NoTools` for a connection check. Log files must be new paths, preventing accidental
loss of a previous run. Output logs can contain project data: keep them private.

The launcher obtains the key using `op read`. The nonsecret reference is resolved
from `-SecretReference`, then `ZAI_API_KEY_REF`, then the `secretReference` property
in `$env:USERPROFILE/.config/agent-cli/zai.json`. The configured reference is
`op://Dev-Automation/ZAI_API_KEY/credential`. The 1Password desktop integration may
require unlocking/approval; do not print the key or embed it in settings, prompts,
command arguments, logs or repository files. Do not silently use a different
credential mechanism if access fails.

The official fixed endpoint is `https://api.z.ai/api/anthropic`. Provider variables
are changed only for the launcher's process and restored afterwards. Claude's
normal Anthropic login and user settings remain unchanged. All Claude model aliases
are pinned to the requested GLM model; there is no fallback to a different provider.
External MCP connectors and agent-spawning tools are excluded. Local edits are
accepted; a limited command allowlist supports normal read/build/test work. A tool
denial should be reported to the coordinator, not bypassed by the worker. This
launcher excludes saved Claude settings sources so a provider override or hook in
those files cannot replace its endpoint or authentication. Pass task permissions
and extra source directories explicitly.

After editing the repository launcher, refresh the installed copy explicitly:

```powershell
Copy-Item -LiteralPath tools/Invoke-ZaiClaude.ps1 -Destination "$env:USERPROFILE/.config/agent-cli/Invoke-ZaiClaude.ps1"
```

Official setup reference: [Z.ai Claude Code integration](https://docs.z.ai/devpack/tool/claude).
We deliberately omit the API time-limit settings shown in that example, following
the user's preference against execution limits.

## Opus through the normal Claude login

Claude Code is installed and authenticated with the user's Claude subscription.
Specify the exact requested model; do not infer it from model self-identification.

```powershell
$taskPrompt = Get-Content -LiteralPath research/opus-task.md -Raw
claude -p $taskPrompt --model claude-opus-5 --permission-mode acceptEdits --no-chrome --output-format stream-json --verbose
```

Use `--add-dir` for authorized source directories outside the project, and specify
appropriate `--tools`/`--allowedTools` for the task. Keep file ownership disjoint
from concurrent agents. The wiki work confirmed `claude-opus-5` in API message
metadata on 2026-09-13. If a model is unavailable, report it instead of substituting.

## Inspecting runs

For stream-json logs, inspect `system/init` for the session and requested model,
`assistant.message.model` for response model metadata, and `result` for success,
errors and permission denials. A launched process alone does not establish success.
Resume with the same session UUID and a new log path when follow-up work is needed.
