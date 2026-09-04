@echo off
setlocal

if /I "%~1"=="tts-setup" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workers\chatterbox_tts\setup.ps1"
  exit /b %ERRORLEVEL%
)

if /I "%~1"=="voice-doctor" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\voice_doctor.ps1"
  exit /b %ERRORLEVEL%
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_global_nav.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_google_oauth.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%

if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cleanup_stale_jarvis.ps1"
)
if /I "%~1"=="run" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cleanup_stale_jarvis.ps1"
)
if /I "%~1"=="api" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cleanup_stale_jarvis.ps1"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0shino.ps1" %*
exit /b %ERRORLEVEL%
