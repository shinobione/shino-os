@echo off
setlocal

REM SHINO owns one stable high local port. Keep it away from generic dev port 8000.
if not defined SHINO_JARVIS_PORT set "SHINO_JARVIS_PORT=18777"

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

REM Do not fight whatever owns localhost:8000. Jarvis handles its own runtime cleanup;
REM SHINO simply uses the dedicated stable port above.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0shino.ps1" %*
exit /b %ERRORLEVEL%
