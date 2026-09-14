# Project agent instructions

Preserve pre-existing changes in this shared working directory. Give concurrent
workers explicit, non-overlapping file ownership.

Do not set execution timeouts or time limits for CLI commands or subagents. Let
them finish; non-terminating polling/output-yield intervals are fine.

## CLI delegation

When the user requests GLM, use Claude Code through
[tools/Invoke-ZaiClaude.ps1](tools/Invoke-ZaiClaude.ps1), which defaults to
`glm-5.3-flash` and retrieves the Z.ai key from 1Password at runtime. For Opus, use
the normal Claude Code login with the exact requested model (`claude-opus-5` was
verified locally). See [docs/agent-cli.md](docs/agent-cli.md) for setup, commands,
permissions, logs and resuming sessions. Never print or persist API keys, and never
silently substitute models. Delegate only when requested by the user.
