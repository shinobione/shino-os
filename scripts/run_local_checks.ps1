param([string]$Python = 'python', [string]$PinnedRuntime = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  & $Python scripts/validate_overlay.py
  if ($LASTEXITCODE) { throw 'overlay validation failed' }
  Get-ChildItem -Recurse -Filter '*.ps1' | ForEach-Object {
    $tokens=$null; $errors=$null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null
    if ($errors.Count) { throw $errors }
  }
  Get-ChildItem extensions/views/shino-command-center -Filter '*.js' | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE) { throw "JS syntax: $($_.Name)" }
  }
  & $Python -c "import ast,pathlib; files=[*pathlib.Path('runtime_overlay').rglob('*.py'),*pathlib.Path('workers').rglob('*.py'),*pathlib.Path('extensions').rglob('*.py')]; [ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p)) for p in files]; print('Python syntax: OK')"
  if ($LASTEXITCODE) { throw 'Python syntax failed' }
  & $Python -m unittest discover -s tests -p 'test_*.py' -v
  if ($LASTEXITCODE) { throw 'voice regression failed' }
  node tests/voice_browser.cjs
  if ($LASTEXITCODE) { throw 'browser regression failed' }
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/launcher.ps1
  if ($LASTEXITCODE) { throw 'launcher regression failed' }
  & $Python tests/workflow_smoke.py "--pinned-runtime=$PinnedRuntime"
  if ($LASTEXITCODE) { throw 'workflow smoke failed' }
  Write-Host 'SHINO local checks: OK'
} finally { Pop-Location }
