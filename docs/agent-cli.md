# CLI agents

Use a CLI agent only when delegation is requested. Give each concurrent agent
explicit file ownership, preserve existing changes, and inspect its actual model
metadata and results. Do not impose execution timeouts or terminate agents solely
because of elapsed time. Do not commit or deploy without task authorization.

## What each agent loads

Claude Code reads `CLAUDE.md` and Codex reads `AGENTS.md`. `AGENTS.md` is the
single entry point here, and `CLAUDE.md` points at it.

| Agent | What it loads |
| --- | --- |
| Interactive Claude Code and `claude -p` | user and project `CLAUDE.md`, plus auto memory |
| Claude subagents | project `CLAUDE.md`, but not the parent's auto memory |
| GLM via the launcher | no settings or `CLAUDE.md`; `AGENTS.md` injected by the launcher (smoke run pending) |
| Codex | `AGENTS.md` natively |

The GLM row follows from the launcher excluding every settings source: the
[Claude Code SDK reference](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
loads project `CLAUDE.md` only when the setting sources include `project`.

## GLM through Claude Code and Z.ai

The maintained launcher is [Invoke-ZaiClaude.ps1](../tools/Invoke-ZaiClaude.ps1).
A reusable installed copy is at
`$env:USERPROFILE/.config/agent-cli/Invoke-ZaiClaude.ps1` on Peter's machine.
Its default model is `glm-5.3-flash`. A live no-tools smoke test on 2026-09-13
returned READY and reported `glm-5.3-flash` in Claude Code's `modelUsage`.

```powershell
powershell -NoProfile -File tools/Invoke-ZaiClaude.ps1 -PromptFile research/my-task.md -LogPath research/my-agent.jsonl
```

From any project, use the installed copy and pass that project's directory:

```powershell
powershell -NoProfile -File "$env:USERPROFILE/.config/agent-cli/Invoke-ZaiClaude.ps1" -WorkingDirectory (Get-Location).Path -PromptFile ./task.md -LogPath ./agent-run.jsonl
```

Optional parameters: `-Model`, `-AddDirectory` (explicit authorized read locations),
`-Resume` (Claude session UUID), `-OutputFormat text|json|stream-json`, `-NoTools`
for a connection check, `-InstructionsFile` to append a file other than the working
directory's `AGENTS.md`, and `-NoInstructions` to append nothing. The prompt comes
from either `-PromptFile` or `-Prompt`, and `-SecretReference` overrides the resolved
1Password reference. Log files must be new paths, preventing accidental loss of a
previous run. Output logs can contain project data: keep them private.

### PowerShell versions

The launcher runs under Windows PowerShell 5.1 and PowerShell 7; `powershell` and
`pwsh` are interchangeable. Only 5.1 is installed on Peter's machine, so the
examples use `powershell`.

Both versions matter for quoting. Windows PowerShell 5.1, and PowerShell 7 before
7.3, rebuild the command line when calling a native program: they drop empty
arguments and strip embedded double quotes. Claude Code is reached through npm's
`claude.ps1`, which forwards to `claude.exe`, so that boundary is always crossed.
The launcher therefore passes empty values as `--setting-sources=` and `--tools=`,
and escapes every other value so the prompt and `--mcp-config` arrive intact. Keep
that handling if you edit the argument list.

That old encoder wraps a value in quotes only when it finds whitespace outside a
quoted run, and it counts every `"` as a delimiter, including the `\"` that
escaping produces. The launcher reproduces that rule, because a trailing backslash
needs doubling inside the wrapping and must be left alone outside it: doubling
unconditionally turns a prompt of `C:\repo\` into `C:\repo\\`. The rule was
measured against 5.1, not assumed.

One class of value cannot be encoded at all: if every space in it follows an odd
number of double quotes, such as a prompt of exactly `"hello world"`, the encoder
leaves the value unwrapped and the space splits it. No escaping repairs that,
since the only way to change the encoder's quote tally is to emit another literal
quote. The launcher stops with an explanatory error instead of passing a corrupted
prompt. PowerShell 7.3 or later encodes these values correctly.

Run the regression tests, which use fake `op` and `claude` commands and need no
network and no secrets:

```powershell
python -m unittest discover -s tests
```

The tests repeat every case under each installed shell. **Only Windows PowerShell
5.1 exists on Peter's machine, so the PowerShell 7.3+ path — where the launcher
does no escaping at all because the shell passes arguments verbatim — is currently
unexercised.** Installing PowerShell 7 would cover it without any change to the
tests.

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

Excluding those sources also excludes `CLAUDE.md`, so the launcher appends the
working directory's `AGENTS.md` to the system prompt itself and prints
`Instructions: <path> (<n> lines)` before starting. A missing `AGENTS.md` is not an
error, but a missing `-InstructionsFile` stops the run and names the path. The file
is passed by path with `--append-system-prompt-file`, which keeps a long file out of
the command line that Windows caps at 32767 characters and the prompt already draws
on. That flag is documented only inside `claude --help`'s `--bare` entry, so the
launcher checks the help text and falls back to `--append-system-prompt` with the
file's text if neither spelling appears.

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
