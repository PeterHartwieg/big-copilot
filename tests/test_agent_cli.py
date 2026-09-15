"""Regression checks for credential scoping and instruction injection.

Uses fake CLIs on PATH, so no network access and no real secrets are involved.
The fake ``claude`` is deliberately split in two: npm installs ``claude`` as a
PowerShell script that forwards to ``claude.exe``, and it is that native call
which Windows PowerShell 5.1 rewrites -- dropping empty arguments and stripping
double quotes. A single-script fake would receive the arguments losslessly and
would therefore prove nothing about the launcher's quoting.

Every case runs under each supported shell that is installed, so a machine with
both Windows PowerShell 5.1 and PowerShell 7 checks both encoders.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SHELLS = [found for found in (shutil.which('pwsh'), shutil.which('powershell')) if found]
LAUNCHER = Path(__file__).resolve().parents[1] / 'tools' / 'Invoke-ZaiClaude.ps1'

OP_SUCCEEDS = "Write-Output 'fixture-only-token'\nexit 0\n"
OP_FAILS = 'exit 1\n'

CLAUDE_SHIM = '''
& "powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/claude-impl.ps1" $args
exit $LASTEXITCODE
'''

REPORT = '''
$json = [pscustomobject]@{
    hasToken = ($env:ANTHROPIC_AUTH_TOKEN -eq 'fixture-only-token')
    noApiKey = (!$env:ANTHROPIC_API_KEY)
    noOauth = (!$env:CLAUDE_CODE_OAUTH_TOKEN)
    endpoint = $env:ANTHROPIC_BASE_URL
    model = $env:ANTHROPIC_MODEL
    args = @($args)
} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'claude-args.json'), $json, (New-Object Text.UTF8Encoding $false))
Write-Output $json
exit 0
'''

# Help text as current Claude Code prints it: the file form appears only in the
# --bare summary, spelled --append-system-prompt[-file].
CLAUDE_IMPL = '''
if ($args -contains '--help') {
    Write-Output '  --append-system-prompt <prompt>  Append a system prompt to the default system prompt'
    Write-Output '  --bare  Explicitly provide context via: --system-prompt[-file], --append-system-prompt[-file], --add-dir'
    exit 0
}
''' + REPORT

# Help text from a build that has no file form at all, which must drive the
# launcher onto the inline --append-system-prompt fallback.
CLAUDE_IMPL_NO_FILE_FLAG = '''
if ($args -contains '--help') {
    Write-Output '  --append-system-prompt <prompt>  Append a system prompt to the default system prompt'
    Write-Output '  --bare  Minimal mode: skip hooks, auto-memory and CLAUDE.md discovery.'
    exit 0
}
''' + REPORT

CLAUDE_REFUSES = "throw 'Claude must not start'\n"


@unittest.skipUnless(SHELLS and os.name == 'nt', 'Windows PowerShell launcher')
class LauncherTests(unittest.TestCase):
    def for_each_shell(self, body):
        """Run body(shell, root) once per installed shell, in a fresh fixture directory."""
        for shell in SHELLS:
            with self.subTest(shell=Path(shell).stem):
                with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
                    body(shell, Path(folder))

    def fixtures(self, root, op=OP_SUCCEEDS, impl=CLAUDE_IMPL):
        """Put fake op and claude commands on a PATH that shadows the real ones."""
        (root / 'op.ps1').write_text(op, encoding='utf-8')
        (root / 'claude.ps1').write_text(CLAUDE_SHIM, encoding='utf-8')
        (root / 'claude-impl.ps1').write_text(impl, encoding='utf-8')
        return dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'])

    def launch(self, shell, env, *arguments):
        command = [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(LAUNCHER),
                   '-SecretReference', 'op://Fixture/Test/credential', *arguments]
        return subprocess.run(command, env=env, capture_output=True, text=True)

    def reported(self, root):
        """The arguments claude.exe actually received, read back losslessly."""
        report = root / 'claude-args.json'
        self.assertTrue(report.exists(), 'claude did not run')
        return json.loads(report.read_text(encoding='utf-8'))

    def round_trip(self, shell, root, value):
        """Send value as the prompt and return what claude.exe received."""
        prompt_file = root / 'task.md'
        prompt_file.write_text(value, encoding='utf-8', newline='')
        result = self.launch(shell, self.fixtures(root), '-PromptFile', str(prompt_file),
                             '-WorkingDirectory', str(root), '-NoTools', '-OutputFormat', 'json')
        self.assertEqual(result.returncode, 0, result.stderr)
        arguments = self.reported(root)['args']
        return arguments[arguments.index('-p') + 1]

    def test_process_credentials_and_restoration(self):
        def body(shell, root):
            env = self.fixtures(root)
            env['ANTHROPIC_AUTH_TOKEN'] = 'original-fixture-token'
            env['ANTHROPIC_BASE_URL'] = 'https://original.invalid'
            env['ANTHROPIC_API_KEY'] = 'original-fixture-api-key'
            env['CLAUDE_CODE_OAUTH_TOKEN'] = 'original-fixture-oauth'
            log = root / 'run.json'
            script = root / 'exercise.ps1'
            script.write_text('''
param($Launcher, $Work, $Log)
& $Launcher -Prompt 'fixture' -WorkingDirectory $Work -SecretReference 'op://Fixture/Test/credential' -NoTools -OutputFormat json -LogPath $Log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($env:ANTHROPIC_AUTH_TOKEN -ne 'original-fixture-token') { throw 'Token not restored' }
if ($env:ANTHROPIC_BASE_URL -ne 'https://original.invalid') { throw 'Endpoint not restored' }
if ($env:ANTHROPIC_API_KEY -ne 'original-fixture-api-key') { throw 'API key not restored' }
if ($env:CLAUDE_CODE_OAUTH_TOKEN -ne 'original-fixture-oauth') { throw 'OAuth not restored' }
''', encoding='utf-8')
            command = [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
                       str(LAUNCHER), str(root), str(log)]
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            data = self.reported(root)
            self.assertTrue(data['hasToken'] and data['noApiKey'] and data['noOauth'])
            self.assertEqual(data['endpoint'], 'https://api.z.ai/api/anthropic')
            self.assertEqual(data['model'], 'glm-5.3-flash')
            self.assertTrue(log.exists())
            self.assertNotIn('fixture-only-token', log.read_text(encoding='utf-8-sig'))
            self.assertNotIn('fixture-only-token', result.stdout + result.stderr)
        self.for_each_shell(body)

    def test_empty_valued_flags_keep_their_empty_value(self):
        def body(shell, root):
            env = self.fixtures(root)
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            # The joined form survives both encoders; a separate '' argument would be
            # dropped by 5.1 and the next flag read as its value.
            self.assertIn('--setting-sources=', arguments)
            self.assertIn('--tools=', arguments)
            self.assertNotIn('--setting-sources', arguments)
            self.assertNotIn('--tools', arguments)
        self.for_each_shell(body)

    def test_prompt_and_mcp_config_survive_quoting(self):
        def body(shell, root):
            prompt = 'Edit "config.json" so that {"a": 1}\nKeep the C:\\repo\\ path.'
            self.assertEqual(self.round_trip(shell, root, prompt), prompt)
            arguments = self.reported(root)['args']
            self.assertEqual(arguments[arguments.index('--mcp-config') + 1], '{"mcpServers":{}}')
        self.for_each_shell(body)

    def test_trailing_backslashes_are_not_doubled_or_lost(self):
        # A value is wrapped in quotes only when it holds whitespace outside a
        # quoted run, and only then does a trailing backslash need doubling.
        values = [
            'C:\\repo\\',                       # no whitespace: must not gain a backslash
            'C:\\my repo\\',                    # whitespace: wrapped, so doubling is required
            'He said "stop" in C:\\my repo\\',   # quotes and whitespace and a trailing backslash
            '"quoted"C:\\repo\\',                # quotes, no whitespace
            'C:\\repo\\\\\\',                   # a run of trailing backslashes
            'C:\\my repo\\\\\\',
        ]

        def body(shell, root):
            for value in values:
                with self.subTest(value=value):
                    self.assertEqual(self.round_trip(shell, root, value), value)
        self.for_each_shell(body)

    def test_value_the_shell_cannot_encode_is_refused_not_corrupted(self):
        # Every space follows an odd number of quotes, so Windows PowerShell leaves
        # the value unwrapped and splits it. PowerShell 7.3+ encodes it correctly.
        def body(shell, root):
            prompt_file = root / 'task.md'
            prompt_file.write_text('"hello world"', encoding='utf-8', newline='')
            result = self.launch(shell, self.fixtures(root), '-PromptFile', str(prompt_file),
                                 '-WorkingDirectory', str(root), '-NoTools', '-OutputFormat', 'json')
            if result.returncode == 0:
                arguments = self.reported(root)['args']
                self.assertEqual(arguments[arguments.index('-p') + 1], '"hello world"')
            else:
                self.assertIn('cannot pass this value', result.stderr)
                self.assertFalse((root / 'claude-args.json').exists())
        self.for_each_shell(body)

    def test_working_directory_agents_file_is_appended(self):
        def body(shell, root):
            env = self.fixtures(root)
            work = root / 'work'
            work.mkdir()
            instructions = work / 'AGENTS.md'
            instructions.write_text('# Project agent instructions\n\nOwn only your files.\n', encoding='utf-8')
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(work),
                                 '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            passed = arguments[arguments.index('--append-system-prompt-file') + 1]
            self.assertTrue(os.path.isabs(passed))
            self.assertEqual(Path(passed).resolve(), instructions.resolve())
            self.assertIn('(3 lines)', result.stdout)
        self.for_each_shell(body)

    def test_inline_fallback_sends_the_file_text(self):
        def body(shell, root):
            env = self.fixtures(root, impl=CLAUDE_IMPL_NO_FILE_FLAG)
            work = root / 'work'
            work.mkdir()
            text = '# Project agent instructions\n\nQuote "carefully" under C:\\my repo\\docs.\n'
            (work / 'AGENTS.md').write_text(text, encoding='utf-8', newline='')
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(work),
                                 '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            self.assertNotIn('--append-system-prompt-file', arguments)
            self.assertEqual(arguments[arguments.index('--append-system-prompt') + 1], text)
        self.for_each_shell(body)

    def test_no_instructions_switch_skips_injection(self):
        def body(shell, root):
            env = self.fixtures(root)
            work = root / 'work'
            work.mkdir()
            (work / 'AGENTS.md').write_text('# Project agent instructions\n', encoding='utf-8')
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(work),
                                 '-NoInstructions', '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            self.assertFalse([a for a in arguments if a.startswith('--append-system-prompt')])
        self.for_each_shell(body)

    def test_missing_explicit_instructions_file_stops_before_claude(self):
        def body(shell, root):
            env = self.fixtures(root, impl=CLAUDE_REFUSES)
            missing = root / 'absent-instructions.md'
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-InstructionsFile', str(missing), '-NoTools', '-OutputFormat', 'json')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(missing.name, result.stderr)
            self.assertFalse((root / 'claude-args.json').exists())
            self.assertNotIn('Claude must not start', result.stderr)
        self.for_each_shell(body)

    def test_secret_failure_does_not_start_claude_or_replace_log(self):
        def body(shell, root):
            env = self.fixtures(root, op=OP_FAILS, impl=CLAUDE_REFUSES)
            log = root / 'run.json'
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoInstructions', '-LogPath', str(log))
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(log.exists())
            self.assertNotIn('Claude must not start', result.stderr)
            log.write_text('previous evidence', encoding='utf-8')
            result = self.launch(shell, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoInstructions', '-LogPath', str(log))
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(log.read_text(encoding='utf-8'), 'previous evidence')
        self.for_each_shell(body)


if __name__ == '__main__':
    unittest.main()
