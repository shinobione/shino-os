@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo [SHINO-OS] Run setup_windows.bat first.
  exit /b 1
)
if "%SHINO_WHISPER_MODEL%"=="" set SHINO_WHISPER_MODEL=small
if "%SHINO_WHISPER_DEVICE%"=="" set SHINO_WHISPER_DEVICE=cuda
if "%SHINO_WHISPER_COMPUTE%"=="" set SHINO_WHISPER_COMPUTE=float16
if "%SHINO_WHISPER_PORT%"=="" set SHINO_WHISPER_PORT=8766
echo [SHINO-OS] Whisper node: model=%SHINO_WHISPER_MODEL% device=%SHINO_WHISPER_DEVICE% port=%SHINO_WHISPER_PORT%
.venv\Scripts\python.exe server.py
