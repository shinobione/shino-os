@echo off
setlocal
cd /d "%~dp0"
if not exist .venv (
  py -3.11 -m venv .venv
  if errorlevel 1 exit /b 1
)
call .venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 exit /b 1
call .venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
echo [SHINO-OS] Whisper node ready.
