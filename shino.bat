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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0shino.ps1" %*
exit /b %ERRORLEVEL%
