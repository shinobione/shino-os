"""Replay existing Windows smoke steps in a disposable, offline workspace.

Requires PyYAML. Optional pinned runtime supplies only git-tracked fixture files
via git archive; the installed runtime is never patched or launched.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
import io
import yaml

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pinned-runtime', default='')
args = parser.parse_args()

with tempfile.TemporaryDirectory(prefix='shino-checks-') as directory:
    work = Path(directory)
    for name in ('scripts', 'runtime_overlay'):
        shutil.copytree(ROOT / name, work / name, ignore=shutil.ignore_patterns('__pycache__'))
    for name in ('shino.ps1', 'UPSTREAM.lock'):
        shutil.copy2(ROOT / name, work / name)
    # Existing sync smoke must never probe/start the actual GPU worker.
    (work / 'scripts/ensure_natural_tts.ps1').write_text("Write-Output ''\n", encoding='utf-8')
    env = os.environ.copy()
    env.update(RUNNER_TEMP=str(work / 'fixtures'), LOCALAPPDATA=str(work / 'local'))
    env.pop('SHINO_RUNTIME_ROOT', None)
    env.pop('SHINO_TTS_URL', None)
    env['PATH'] = str(Path(os.sys.executable).parent) + os.pathsep + env['PATH']
    # Exercise actual batch control flow with a harmless failing child.
    batch = (ROOT / 'shino.bat').read_text().replace('powershell.exe', 'call "%~dp0fake-powershell.bat"')
    (work / 'shino.bat').write_text(batch)
    (work / 'fake-powershell.bat').write_text('@exit /b 7\n')
    for command in ('tts-setup', 'voice-doctor'):
        result = subprocess.run(['cmd.exe', '/d', '/c', 'shino.bat', command], cwd=work, env=env)
        assert result.returncode == 7, f'{command} swallowed child exit status'
    print('Batch helper exit propagation: OK', flush=True)
    def ps(code):
        script = work / 'step.ps1'
        # Actions writes BOM-less step scripts; match its Windows PS 5.1 decoding.
        script.write_text("$ErrorActionPreference = 'Stop'\n" + code, encoding='utf-8')
        subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script)], cwd=work, env=env, check=True)

    workflow = yaml.safe_load((ROOT / '.github/workflows/overlay-ci.yml').read_text(encoding='utf-8'))
    for step in workflow['jobs']['windows-launcher']['steps']:
        if step.get('name', '').startswith('Smoke '):
            print(step['name'], flush=True)
            ps(step['run'])
    # Explicitly verify startup failure leaves a usable endpoint configured.
    ps("$text = Get-Content (Join-Path $env:RUNNER_TEMP 'shino-voice-runtime/jarvis-OS/.env') -Raw\nif ($text -notmatch 'SHINO_TTS_URL=http://127.0.0.1:18765') { throw 'startup failure disabled Chatterbox' }")

    if args.pinned_runtime:
        pin = json.loads((ROOT / 'UPSTREAM.lock').read_text())['ref']
        upstream = Path(args.pinned_runtime).resolve()
        files = ['src/jarvis/interfaces/api/google_oauth.py', 'src/jarvis/interfaces/ui/static/capabilities.js', 'src/jarvis/interfaces/ui/static/capabilities.html']
        archive = subprocess.check_output(['git', '-c', f'safe.directory={upstream.as_posix()}', '-C', str(upstream), 'archive', '--format=zip', pin, *files])
        fixture = work / 'fixtures/shino-oauth-runtime/jarvis-OS'
        fixture.mkdir(parents=True)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            zipped.extractall(fixture)
        for command in (['init'], ['add', '.'], ['-c', 'user.name=SHINO tests', '-c', 'user.email=tests@shino.local', 'commit', '-m', 'fixture']):
            subprocess.run(['git', '-C', str(fixture), *command], check=True, stdout=subprocess.DEVNULL)
        oauth = next(yaml.safe_load(p.read_text(encoding='utf-8')) for p in (ROOT / '.github/workflows').glob('*') if 'oauth-runtime-windows:' in p.read_text())
        for step in oauth['jobs']['oauth-runtime-windows']['steps']:
            if step.get('name') in ('Patch exact runtime twice', 'Validate patched runtime'):
                print(step['name'], flush=True)
                ps(step['run'])
    else:
        print('Pinned OAuth smoke omitted: pass -PinnedRuntime to include it (CI has its own pinned job).')
print('Existing workflow smoke checks: OK')
