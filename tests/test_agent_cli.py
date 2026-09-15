"""Regression checks for credential scoping and instruction injection.

Uses fake CLIs on PATH, so no network access and no real secrets are involved.
The fake ``claude`` is deliberately split in two: npm installs ``claude`` as a
PowerShell script that forwards to ``claude.exe``, and it is that native call
which Windows PowerShell 5.1 rewrites -- dropping empty arguments and stripping
double quotes. A single-script fake would receive the arguments losslessly and
would therefore prove nothing about the launcher's quoting.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SHELL = shutil.which('pwsh') or shutil.which('powershell')
LAUNCHER = Path(__file__).resolve().parents[1] / 'tools' / 'Invoke-ZaiClaude.ps1'

OP_SUCCEEDS = "Write-Output 'fixture-only-token'\nexit 0\n"
OP_FAILS = 'exit 1\n'

CLAUDE_SHIM = '''
& "powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/claude-impl.ps1" $args
exit $LASTEXITCODE
'''

CLAUDE_IMPL = '''
if ($args -contains '--help') {
    Write-Output '  --append-system-prompt <prompt>  Append a system prompt to the default system prompt'
    Write-Output '  --bare  Explicitly provide context via: --system-prompt[-file], --append-system-prompt[-file], --add-dir'
    exit 0
}
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

CLAUDE_REFUSES = "throw 'Claude must not start'\n"


@unittest.skipUnless(SHELL and os.name == 'nt', 'Windows PowerShell launcher')
class LauncherTests(unittest.TestCase):
    def fixtures(self, root, op=OP_SUCCEEDS, impl=CLAUDE_IMPL):
        """Put fake op and claude commands on a PATH that shadows the real ones."""
        (root / 'op.ps1').write_text(op, encoding='utf-8')
        (root / 'claude.ps1').write_text(CLAUDE_SHIM, encoding='utf-8')
        (root / 'claude-impl.ps1').write_text(impl, encoding='utf-8')
        return dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'])

    def launch(self, root, env, *arguments):
        command = [SHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(LAUNCHER),
                   '-SecretReference', 'op://Fixture/Test/credential', *arguments]
        return subprocess.run(command, env=env, capture_output=True, text=True)

    def reported(self, root):
        """The arguments claude.exe actually received, read back losslessly."""
        report = root / 'claude-args.json'
        self.assertTrue(report.exists(), 'claude did not run')
        return json.loads(report.read_text(encoding='utf-8'))

    def test_process_credentials_and_restoration(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
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
            command = [SHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
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

    def test_empty_valued_flags_keep_their_empty_value(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root)
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            # The joined form survives both PowerShell versions; a separate ''
            # argument would be dropped by 5.1 and the next flag read as its value.
            self.assertIn('--setting-sources=', arguments)
            self.assertIn('--tools=', arguments)
            self.assertNotIn('--setting-sources', arguments)
            self.assertNotIn('--tools', arguments)

    def test_prompt_and_mcp_config_survive_quoting(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root)
            prompt = 'Edit "config.json" so that {"a": 1}\nKeep the C:\\repo\\ path.'
            prompt_file = root / 'task.md'
            prompt_file.write_text(prompt, encoding='utf-8', newline='')
            result = self.launch(root, env, '-PromptFile', str(prompt_file),
                                 '-WorkingDirectory', str(root), '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            self.assertEqual(arguments[arguments.index('-p') + 1], prompt)
            self.assertEqual(arguments[arguments.index('--mcp-config') + 1], '{"mcpServers":{}}')

    def test_working_directory_agents_file_is_appended(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root)
            work = root / 'work'
            work.mkdir()
            instructions = work / 'AGENTS.md'
            instructions.write_text('# Project agent instructions\n\nOwn only your files.\n', encoding='utf-8')
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(work),
                                 '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            passed = arguments[arguments.index('--append-system-prompt-file') + 1]
            self.assertTrue(os.path.isabs(passed))
            self.assertEqual(Path(passed).resolve(), instructions.resolve())
            self.assertIn('(3 lines)', result.stdout)

    def test_no_instructions_switch_skips_injection(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root)
            work = root / 'work'
            work.mkdir()
            (work / 'AGENTS.md').write_text('# Project agent instructions\n', encoding='utf-8')
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(work),
                                 '-NoInstructions', '-NoTools', '-OutputFormat', 'json')
            self.assertEqual(result.returncode, 0, result.stderr)
            arguments = self.reported(root)['args']
            self.assertFalse([a for a in arguments if a.startswith('--append-system-prompt')])

    def test_missing_explicit_instructions_file_stops_before_claude(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root, impl=CLAUDE_REFUSES)
            missing = root / 'absent-instructions.md'
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-InstructionsFile', str(missing), '-NoTools', '-OutputFormat', 'json')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(missing.name, result.stderr)
            self.assertFalse((root / 'claude-args.json').exists())
            self.assertNotIn('Claude must not start', result.stderr)

    def test_secret_failure_does_not_start_claude_or_replace_log(self):
        with tempfile.TemporaryDirectory(prefix='wiki-agent-cli-') as folder:
            root = Path(folder)
            env = self.fixtures(root, op=OP_FAILS, impl=CLAUDE_REFUSES)
            log = root / 'run.json'
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoInstructions', '-LogPath', str(log))
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(log.exists())
            self.assertNotIn('Claude must not start', result.stderr)
            log.write_text('previous evidence', encoding='utf-8')
            result = self.launch(root, env, '-Prompt', 'fixture', '-WorkingDirectory', str(root),
                                 '-NoInstructions', '-LogPath', str(log))
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(log.read_text(encoding='utf-8'), 'previous evidence')


if __name__ == '__main__':
    unittest.main()
