from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import httpx
import numpy as np
from fastapi import APIRouter, Request, Response
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio.tts import tts_engine

router = APIRouter(prefix="/api/shino/voice", tags=["shino-local-voice"])

_MAX_PCM_BYTES = 12 * 1024 * 1024
_HANDY_TIMEOUT_SECONDS = 60.0
_DEFAULT_HANDY_MODEL = "handy-computer/whisper-large-v3-turbo-gguf"
_DEFAULT_HANDY_DEVICE_INDEX = "0"

_stt_lock = asyncio.Lock()
_stt_phase = "cold"
_stt_started_at = 0.0
_stt_last_ms: float | None = None
_stt_last_error = ""
_stt_last_backend = ""
_stt_last_bound_backend = ""
_stt_last_load_ms: float | None = None
_stt_last_infer_ms: float | None = None
_stt_last_rtf: float | None = None


class TTSRequest(BaseModel):
    text: str


def _handy_model() -> str:
    return (os.getenv("SHINO_HANDY_MODEL") or _DEFAULT_HANDY_MODEL).strip()


def _handy_device_index() -> str:
    return (os.getenv("SHINO_HANDY_DEVICE_INDEX") or _DEFAULT_HANDY_DEVICE_INDEX).strip()


def _find_handy_exe() -> Path | None:
    override = (os.getenv("SHINO_HANDY_EXE") or "").strip()
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override).expanduser())

    local_app_data = (os.getenv("LOCALAPPDATA") or "").strip()
    if local_app_data:
        candidates.append(Path(local_app_data) / "Handy" / "handy.exe")

    found = shutil.which("handy") or shutil.which("handy.exe")
    if found:
        candidates.append(Path(found))

    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _write_pcm16_wav(pcm: bytes, path: Path) -> float:
    audio = np.frombuffer(pcm, dtype=np.float32).copy()
    if audio.size == 0:
        return 0.0
    audio = np.nan_to_num(audio, nan=0.0, posinf=1.0, neginf=-1.0)
    audio = np.clip(audio, -1.0, 1.0)
    pcm16 = np.rint(audio * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16_000)
        wav.writeframes(pcm16.tobytes())
    return float(pcm16.size) / 16_000.0


def _run_handy_blocking(args: list[str], stdout_path: Path, stderr_path: Path) -> int:
    """Run Handy with real file handles.

    Handy's Windows release is built as a GUI-subsystem executable. Capturing its
    stdout/stderr through asyncio PIPEs is unreliable on some Windows builds,
    while explicit redirected file handles are reliable (and match PowerShell's
    Start-Process -RedirectStandardOutput/-RedirectStandardError behaviour).
    """
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        completed = subprocess.run(
            args,
            stdout=stdout_file,
            stderr=stderr_file,
            timeout=_HANDY_TIMEOUT_SECONDS,
            check=False,
            creationflags=creationflags,
        )
    return int(completed.returncode)


async def _run_handy(pcm: bytes) -> dict[str, object]:
    handy = _find_handy_exe()
    if handy is None:
        raise RuntimeError(
            "Handy introuvable. Installe Handy ou définis SHINO_HANDY_EXE vers handy.exe."
        )

    model = _handy_model()
    device_index = _handy_device_index()
    temp_dir = Path(tempfile.mkdtemp(prefix="shino-handy-"))
    wav_path = temp_dir / "input.wav"
    stdout_path = temp_dir / "stdout.txt"
    stderr_path = temp_dir / "stderr.txt"

    try:
        audio_secs = await asyncio.to_thread(_write_pcm16_wav, pcm, wav_path)
        args = [
            str(handy),
            "--transcribe-file",
            str(wav_path),
            "--model",
            model,
            "--device-index",
            device_index,
            "--json",
        ]
        logger.info(
            "SHINO Handy STT start: model={}, device_index={}, audio={:.2f}s, exe={}",
            model,
            device_index,
            audio_secs,
            handy,
        )

        try:
            returncode = await asyncio.to_thread(
                _run_handy_blocking, args, stdout_path, stderr_path
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Handy timeout après {int(_HANDY_TIMEOUT_SECONDS)} s") from exc

        stdout_text = stdout_path.read_text(encoding="utf-8", errors="replace").strip() if stdout_path.exists() else ""
        stderr_text = stderr_path.read_text(encoding="utf-8", errors="replace").strip() if stderr_path.exists() else ""

        if returncode != 0:
            detail = stderr_text[-1600:] or stdout_text[-1600:] or "aucun détail"
            raise RuntimeError(f"Handy exit {returncode}: {detail}")
        if not stdout_text:
            detail = stderr_text[-1200:] or "stdout vide"
            raise RuntimeError(f"Handy n'a renvoyé aucun JSON: {detail}")

        try:
            payload = json.loads(stdout_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"JSON Handy invalide: {stdout_text[-1200:]}") from exc

        text = str(payload.get("text") or "").strip()
        payload["text"] = text
        payload["audio_secs"] = float(payload.get("audio_secs") or audio_secs)
        return payload
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/status")
async def status() -> dict[str, object]:
    remote = (os.getenv("SHINO_STT_URL") or "").strip()
    handy = _find_handy_exe()
    phase = _stt_phase
    elapsed_ms = None
    if _stt_started_at and phase in {"handy", "lan"}:
        elapsed_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)

    return {
        "ok": True,
        "stt": "lan" if remote else "handy",
        "stt_url": remote or None,
        "stt_phase": phase,
        "stt_elapsed_ms": elapsed_ms,
        "stt_last_ms": _stt_last_ms,
        "stt_last_error": _stt_last_error or None,
        "stt_last_backend": _stt_last_backend or None,
        "handy_available": handy is not None,
        "handy_exe": str(handy) if handy else None,
        "handy_model": _handy_model(),
        "handy_device_index": _handy_device_index(),
        "handy_bound_backend": _stt_last_bound_backend or None,
        "handy_load_ms": _stt_last_load_ms,
        "handy_transcribe_ms": _stt_last_infer_ms,
        "handy_rtf": _stt_last_rtf,
        "tts": settings.tts_provider,
        "llm": settings.llm_provider,
    }


async def _remote_transcribe(remote: str, pcm: bytes) -> str:
    url = remote.rstrip("/") + "/transcribe"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            content=pcm,
            headers={"Content-Type": "application/octet-stream"},
        )
        response.raise_for_status()
        data = response.json()
    return str(data.get("text") or "").strip()


@router.post("/transcribe")
async def transcribe(request: Request) -> dict[str, object]:
    global _stt_phase, _stt_started_at, _stt_last_ms, _stt_last_error
    global _stt_last_backend, _stt_last_bound_backend, _stt_last_load_ms
    global _stt_last_infer_ms, _stt_last_rtf

    pcm = await request.body()
    if not pcm:
        return {"text": "", "backend": "empty"}
    if len(pcm) > _MAX_PCM_BYTES:
        return {"text": "", "backend": "rejected", "error": "audio_too_large"}

    async with _stt_lock:
        _stt_started_at = time.perf_counter()
        _stt_last_error = ""
        remote = (os.getenv("SHINO_STT_URL") or "").strip()

        if remote:
            _stt_phase = "lan"
            try:
                logger.info("SHINO STT LAN start: {} bytes -> {}", len(pcm), remote)
                text = await _remote_transcribe(remote, pcm)
                _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
                _stt_last_backend = "lan"
                _stt_phase = "ready"
                return {
                    "text": text,
                    "backend": "lan",
                    "url": remote,
                    "duration_ms": _stt_last_ms,
                    "device": "lan",
                }
            except Exception as exc:
                logger.warning("SHINO STT LAN failed -> Handy local: {}", str(exc)[:220])

        _stt_phase = "handy"
        logger.info(
            "SHINO STT Handy local start: model={}, device_index={}, pcm_bytes={}",
            _handy_model(),
            _handy_device_index(),
            len(pcm),
        )
        try:
            handy = await _run_handy(pcm)
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_last_backend = "handy"
            _stt_last_bound_backend = str(handy.get("bound_backend") or "")
            _stt_last_load_ms = float(handy.get("load_ms") or 0.0)
            raw_times = handy.get("transcribe_ms") or []
            if isinstance(raw_times, list) and raw_times:
                _stt_last_infer_ms = float(raw_times[0])
            else:
                _stt_last_infer_ms = float(handy.get("best_ms") or 0.0)
            _stt_last_rtf = float(handy.get("rtf") or 0.0)
            _stt_phase = "ready"
            logger.info(
                "SHINO Handy STT done: total={} ms, load={} ms, infer={} ms, backend={}, rtf={:.2f}x, chars={}",
                _stt_last_ms,
                _stt_last_load_ms,
                _stt_last_infer_ms,
                _stt_last_bound_backend or "?",
                _stt_last_rtf,
                len(str(handy.get("text") or "")),
            )
        except Exception as exc:
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_phase = "error"
            _stt_last_error = str(exc)[:500]
            logger.exception("SHINO Handy STT failed after {} ms", _stt_last_ms)
            raise

        return {
            "text": str(handy.get("text") or "").strip(),
            "backend": "handy",
            "model": str(handy.get("model") or _handy_model()),
            "device": str(handy.get("requested_device") or f"index {_handy_device_index()}"),
            "bound_backend": _stt_last_bound_backend or None,
            "duration_ms": _stt_last_ms,
            "load_ms": _stt_last_load_ms,
            "transcribe_ms": _stt_last_infer_ms,
            "rtf": _stt_last_rtf,
        }


@router.post("/tts")
async def tts(body: TTSRequest) -> Response:
    text = body.text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")
    audio = await tts_engine.synthesize(text)
    return Response(content=audio, media_type="audio/wav")
