$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Import-Functions($Path) {
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $Path), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw $errors }
  foreach ($fn in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($fn.Extent.Text.Replace("function $($fn.Name)", "function script:$($fn.Name)")))
  }
}
Import-Functions './shino.ps1'
$JarvisDir = 'C:\test-runtime\jarvis-OS'
$DefaultShinoPort = 18777
$env:SHINO_JARVIS_PORT = '18765'
$rejected = $false
try { Get-ShinoStableJarvisPort } catch { $rejected = $true }
Assert $rejected 'Jarvis must not bind the Chatterbox port'
$env:SHINO_JARVIS_PORT = '18777'
Assert ((Get-ShinoStableJarvisPort) -eq 18777) 'stable OAuth port changed'
$script:owner = [pscustomobject]@{ Name='python.exe'; ExecutablePath='C:\other\python.exe'; ProcessId=12345 }
$script:stopped = @()
function Get-PortListenerPids { @(12345) }
function Get-CimInstance { $script:owner }
function Stop-Process { param($Id, [switch]$Force, $ErrorAction) $script:stopped += $Id }
function Start-Sleep { }
$rejected = $false
try { Stop-StaleJarvisRuntime 18777 } catch { $rejected = $true }
Assert $rejected 'unknown listener must block startup'
Assert ($script:stopped.Count -eq 0) 'unknown process was killed'
Assert (-not (Test-ShinoRuntimeProcess ([pscustomobject]@{Name='python.exe'; ExecutablePath='C:\test-runtime\jarvis-OS-other\python.exe'}))) 'prefix collision accepted'
Assert (Test-ShinoRuntimeProcess ([pscustomobject]@{Name='python.exe'; ExecutablePath="$JarvisDir\bundle\.venv\Scripts\python.exe"; CommandLine='python -m jarvis.app'})) 'owned Python not recognized'
Assert (-not (Test-ShinoRuntimeProcess ([pscustomobject]@{Name='python.exe'; ExecutablePath="$JarvisDir\bundle\.venv\Scripts\python.exe"; CommandLine='python -m unittest'}))) 'runtime test process selected for cleanup'
Assert (-not (Test-ShinoRuntimeProcess ([pscustomobject]@{Name='python.exe'; ExecutablePath='C:\test-runtime\workers\chatterbox\.venv\Scripts\python.exe'}))) 'Chatterbox included in Jarvis cleanup'

Import-Functions './scripts/ensure_natural_tts.ps1'
Assert (-not (Test-CurrentWorkerSchema ([pscustomobject]@{ready=$true; ok=$true; engine='other'}))) 'foreign service accepted'
Assert (Test-CurrentWorkerSchema ([pscustomobject]@{ready=$false; ok=$true; engine='chatterbox-multilingual-v3'})) 'cold worker schema rejected'
$Root = (Get-Location).Path
$Logs = Join-Path $env:TEMP 'shino-mocked-logs'
$Python = 'C:\mock\python.exe'
$Port = 18765
$script:probes = 0
function Test-Path { $true }
function New-Item { }
function Start-Process { [pscustomobject]@{ HasExited=$false; ExitCode=0 } }
function Test-ChatterboxHealth {
  $script:probes++
  if ($script:probes -gt 40) { [pscustomobject]@{ready=$false; ok=$true; engine='chatterbox-multilingual-v3'} }
}
Assert (Start-ChatterboxWorker) 'slow cold worker should survive old 16-second startup window'
Assert ($script:probes -eq 41) 'startup mock not exercised'
function Start-Process { [pscustomobject]@{ HasExited=$true; ExitCode=1 } }
Assert (-not (Start-ChatterboxWorker)) 'dead worker reported success'
function Require-Git { }
function Read-UpstreamLock { [pscustomobject]@{ref='pinned'; repository='fixture'} }
function git { $global:LASTEXITCODE = 0; 'drifted' }
$RuntimeRoot = 'C:\test-runtime'
$Command = 'run'
$rejected = $false
try { Ensure-Upstream } catch { $rejected = $true }
Assert $rejected 'runtime drift must block run'
$Command = 'update'
Ensure-Upstream
Write-Host 'Launcher ownership, reserved ports, worker identity, slow startup and exit: OK'
