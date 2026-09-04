from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import httpx
import numpy as np
from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio.tts import tts_engine

router = APIRouter(prefix="/api/shino/voice", tags=["shino-local-voice"])

_MAX_PCM_BYTES = 12 * 1024 * 1024
_HANDY_TIMEOUT_SECONDS = 60.0
_HANDY_RESIDENT_RESULT_TIMEOUT_SECONDS = 18.0
_NATURAL_TTS_TIMEOUT_SECONDS = 45.0
_DEFAULT_HANDY_MODEL = "whisper-large-v3-turbo"
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

_handy_resident_lock = asyncio.Lock()
_handy_resident_phase = "idle"
_handy_resident_started_at = 0.0
_handy_resident_baseline_id = 0
_handy_resident_history_db = ""
_handy_resident_last_ms: float | None = None
_handy_resident_last_error = ""
_handy_resident_started_by_shino = False

_tts_last_backend = "piper"
_tts_last_error = ""
_tts_last_ms: float | None = None


class TTSRequest(BaseModel):
    text: str
    language_id: str | None = None


def _handy_model() -> str:
    return (os.getenv("SHINO_HANDY_MODEL") or _DEFAULT_HANDY_MODEL).strip()


def _handy_device_index() -> str:
    return (os.getenv("SHINO_HANDY_DEVICE_INDEX") or _DEFAULT_HANDY_DEVICE_INDEX).strip()


def _natural_tts_url() -> str:
    return (os.getenv("SHINO_TTS_URL") or "").strip().rstrip("/")


def _natural_tts_language() -> str:
    return (os.getenv("SHINO_TTS_LANGUAGE") or "fr").strip() or "fr"


def _creationflags() -> int:
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0))


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


def _handy_process_running() -> bool:
    if os.name != "nt":
        return False
    try:
        completed = subprocess.run(
            ["tasklist.exe", "/FI", "IMAGENAME eq handy.exe", "/FO", "CSV", "/NH"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
            creationflags=_creationflags(),
        )
        output = completed.stdout.decode("utf-8", errors="replace").lower()
        return "handy.exe" in output and "no tasks are running" not in output
    except Exception:
        return False


def _handy_data_candidates(handy: Path | None) -> list[Path]:
    candidates: list[Path] = []
    if handy is not None:
        portable = handy.parent / "portable"
        data = handy.parent / "Data"
        if portable.exists() or data.exists():
            candidates.append(data)

    for env_name in ("APPDATA", "LOCALAPPDATA"):
        root = (os.getenv(env_name) or "").strip()
        if not root:
            continue
        base = Path(root)
        candidates.extend(
            [
                base / "com.pais.handy",
                base / "Handy",
                base / "handy",
            ]
        )

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate).lower()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def _find_handy_history_db(handy: Path | None) -> Path | None:
    for data_dir in _handy_data_candidates(handy):
        candidate = data_dir / "history.db"
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _find_handy_settings_store(handy: Path | None) -> Path | None:
    for data_dir in _handy_data_candidates(handy):
        candidate = data_dir / "settings_store.json"
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _read_handy_settings(handy: Path | None) -> dict[str, object]:
    store = _find_handy_settings_store(handy)
    if store is None:
        return {}
    try:
        payload = json.loads(store.read_text(encoding="utf-8", errors="replace"))
        settings_payload = payload.get("settings") if isinstance(payload, dict) else None
        return settings_payload if isinstance(settings_payload, dict) else {}
    except Exception:
        return {}


def _latest_handy_history(db_path: Path | None) -> tuple[int, str, int] | None:
    if db_path is None or not db_path.is_file():
        return None
    connection: sqlite3.Connection | None = None
    try:
        uri = f"file:{db_path.as_posix()}?mode=ro"
        connection = sqlite3.connect(uri, uri=True, timeout=0.25)
        row = connection.execute(
            "SELECT id, transcription_text, timestamp FROM transcription_history ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        return int(row[0]), str(row[1] or "").strip(), int(row[2] or 0)
    except sqlite3.Error:
        return None
    finally:
        if connection is not None:
            connection.close()


def _validate_resident_handy_settings(handy: Path) -> tuple[bool, str, dict[str, object]]:
    snapshot = _read_handy_settings(handy)
    if not snapshot:
        return False, "settings_store.json Handy introuvable ou illisible", snapshot

    selected = str(snapshot.get("selected_model") or "").strip()
    wanted = _handy_model()
    if not selected:
        return False, "aucun modele selectionne dans l'application Handy", snapshot
    if selected != wanted:
        return False, f"modele Handy actif different ({selected})", snapshot

    accelerator = str(snapshot.get("transcribe_accelerator") or "auto").strip().lower()
    if accelerator == "cpu":
        return False, "Handy normal est force sur CPU", snapshot

    return True, "", snapshot


def _start_handy_app_blocking(handy: Path) -> bool:
    global _handy_resident_started_by_shino
    if _handy_process_running():
        return True

    subprocess.Popen(
        [str(handy), "--start-hidden"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=_creationflags(),
    )
    _handy_resident_started_by_shino = True

    deadline = time.perf_counter() + 8.0
    while time.perf_counter() < deadline:
        if _handy_process_running():
            # Give Tauri/managers a short moment to finish setup before the
            # single-instance remote-control command is sent.
            time.sleep(0.9)
            return True
        time.sleep(0.15)
    return False


def _toggle_handy_recording_blocking(handy: Path) -> None:
    completed = subprocess.run(
        [str(handy), "--toggle-transcription"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=6,
        check=False,
        creationflags=_creationflags(),
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()[-800:]
        raise RuntimeError(f"Handy toggle exit {completed.returncode}: {detail or 'aucun detail'}")


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
    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        completed = subprocess.run(
            args,
            stdout=stdout_file,
            stderr=stderr_file,
            timeout=_HANDY_TIMEOUT_SECONDS,
            check=False,
            creationflags=_creationflags(),
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
            "SHINO Handy STT one-shot start: model={}, device_index={}, audio={:.2f}s, exe={}",
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
    if _stt_started_at and phase in {"handy", "lan", "handy-resident"}:
        elapsed_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)

    resident_settings: dict[str, object] = {}
    resident_compatible = False
    resident_reason = ""
    if handy is not None:
        resident_compatible, resident_reason, resident_settings = _validate_resident_handy_settings(handy)

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
        "handy_resident_compatible": resident_compatible,
        "handy_resident_reason": resident_reason or None,
        "handy_resident_phase": _handy_resident_phase,
        "handy_resident_running": _handy_process_running(),
        "handy_resident_model": str(resident_settings.get("selected_model") or "") or None,
        "handy_resident_accelerator": str(resident_settings.get("transcribe_accelerator") or "") or None,
        "handy_resident_history_db": _handy_resident_history_db or None,
        "handy_resident_last_ms": _handy_resident_last_ms,
        "handy_resident_last_error": _handy_resident_last_error or None,
        "tts": _tts_last_backend,
        "tts_url": _natural_tts_url() or None,
        "tts_last_ms": _tts_last_ms,
        "tts_last_error": _tts_last_error or None,
        "tts_fallback": settings.tts_provider,
        "llm": settings.llm_provider,
    }


@router.post("/handy-resident/start")
async def handy_resident_start() -> dict[str, object]:
    global _handy_resident_phase, _handy_resident_started_at
    global _handy_resident_baseline_id, _handy_resident_history_db
    global _handy_resident_last_error

    async with _handy_resident_lock:
        handy = _find_handy_exe()
        if handy is None:
            return {"ok": False, "reason": "Handy introuvable"}

        compatible, reason, snapshot = _validate_resident_handy_settings(handy)
        if not compatible:
            _handy_resident_last_error = reason
            return {
                "ok": False,
                "reason": reason,
                "selected_model": snapshot.get("selected_model"),
                "accelerator": snapshot.get("transcribe_accelerator"),
            }

        if _handy_resident_phase == "recording":
            return {"ok": True, "mode": "resident", "already_recording": True}

        try:
            running = await asyncio.to_thread(_start_handy_app_blocking, handy)
            if not running:
                raise RuntimeError("Handy resident ne demarre pas")

            # Resolve the DB after the app is up; first launch may create it.
            db_path: Path | None = None
            deadline = time.perf_counter() + 4.0
            while time.perf_counter() < deadline:
                db_path = _find_handy_history_db(handy)
                if db_path is not None:
                    break
                await asyncio.sleep(0.1)
            if db_path is None:
                raise RuntimeError("history.db Handy introuvable")

            latest = await asyncio.to_thread(_latest_handy_history, db_path)
            _handy_resident_baseline_id = int(latest[0]) if latest else 0
            _handy_resident_history_db = str(db_path)

            await asyncio.to_thread(_toggle_handy_recording_blocking, handy)
            _handy_resident_started_at = time.perf_counter()
            _handy_resident_phase = "recording"
            _handy_resident_last_error = ""
            logger.info(
                "SHINO Handy resident recording start: model={}, baseline_id={}, db={}",
                _handy_model(),
                _handy_resident_baseline_id,
                db_path,
            )
            return {
                "ok": True,
                "mode": "resident",
                "model": _handy_model(),
                "baseline_id": _handy_resident_baseline_id,
            }
        except Exception as exc:
            _handy_resident_phase = "error"
            _handy_resident_last_error = str(exc)[:800]
            logger.warning("SHINO Handy resident start failed: {}", _handy_resident_last_error)
            return {"ok": False, "reason": _handy_resident_last_error}


@router.post("/handy-resident/stop")
async def handy_resident_stop() -> dict[str, object]:
    global _handy_resident_phase, _handy_resident_last_ms
    global _handy_resident_last_error, _stt_phase, _stt_started_at
    global _stt_last_ms, _stt_last_error, _stt_last_backend
    global _stt_last_bound_backend, _stt_last_load_ms, _stt_last_infer_ms

    async with _handy_resident_lock:
        handy = _find_handy_exe()
        if handy is None:
            return {"ok": False, "reason": "Handy introuvable"}
        if _handy_resident_phase != "recording":
            return {"ok": False, "reason": f"Handy resident n'est pas en enregistrement ({_handy_resident_phase})"}

        _handy_resident_phase = "transcribing"
        _stt_phase = "handy-resident"
        _stt_started_at = time.perf_counter()
        try:
            await asyncio.to_thread(_toggle_handy_recording_blocking, handy)
            db_path = Path(_handy_resident_history_db) if _handy_resident_history_db else _find_handy_history_db(handy)
            if db_path is None:
                raise RuntimeError("history.db Handy introuvable apres arret")

            deadline = time.perf_counter() + _HANDY_RESIDENT_RESULT_TIMEOUT_SECONDS
            latest: tuple[int, str, int] | None = None
            while time.perf_counter() < deadline:
                latest = await asyncio.to_thread(_latest_handy_history, db_path)
                if latest and latest[0] > _handy_resident_baseline_id:
                    break
                await asyncio.sleep(0.06)
            else:
                raise RuntimeError(
                    f"aucun resultat Handy resident apres {_HANDY_RESIDENT_RESULT_TIMEOUT_SECONDS:.0f} s"
                )

            text = str(latest[1] if latest else "").strip()
            elapsed_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _handy_resident_last_ms = elapsed_ms
            _handy_resident_phase = "ready"
            _handy_resident_last_error = ""

            _stt_phase = "ready"
            _stt_last_ms = elapsed_ms
            _stt_last_error = ""
            _stt_last_backend = "handy-resident"
            _stt_last_bound_backend = "resident"
            _stt_last_load_ms = 0.0
            _stt_last_infer_ms = elapsed_ms

            logger.info(
                "SHINO Handy resident done: total={} ms, history_id={}, chars={}",
                elapsed_ms,
                latest[0] if latest else None,
                len(text),
            )
            return {
                "ok": True,
                "text": text,
                "backend": "handy-resident",
                "model": _handy_model(),
                "device": "resident",
                "bound_backend": "resident",
                "duration_ms": elapsed_ms,
                "load_ms": 0.0,
                "transcribe_ms": elapsed_ms,
                "history_id": latest[0] if latest else None,
            }
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _handy_resident_last_ms = elapsed_ms
            _handy_resident_phase = "error"
            _handy_resident_last_error = str(exc)[:800]
            _stt_phase = "ready"
            logger.warning("SHINO Handy resident stop failed -> one-shot fallback possible: {}", _handy_resident_last_error)
            return {"ok": False, "reason": _handy_resident_last_error, "duration_ms": elapsed_ms}


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
            "SHINO STT Handy one-shot start: model={}, device_index={}, pcm_bytes={}",
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
                "SHINO Handy one-shot done: total={} ms, load={} ms, infer={} ms, backend={}, rtf={:.2f}x, chars={}",
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
            _stt_last_error = str(exc)[:1000]
            logger.exception("SHINO Handy STT failed after {} ms", _stt_last_ms)
            raise HTTPException(status_code=502, detail=_stt_last_error) from exc

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


async def _natural_tts(text: str, language_id: str) -> tuple[bytes, str, float] | None:
    url = _natural_tts_url()
    if not url:
        return None

    payload: dict[str, object] = {
        "text": text,
        "language_id": language_id,
        "exaggeration": float(os.getenv("SHINO_CHATTERBOX_EXAGGERATION") or "0.5"),
        "cfg_weight": float(os.getenv("SHINO_CHATTERBOX_CFG_WEIGHT") or "0.4"),
        "temperature": float(os.getenv("SHINO_CHATTERBOX_TEMPERATURE") or "0.8"),
    }
    reference = (os.getenv("SHINO_CHATTERBOX_REFERENCE") or "").strip()
    if reference:
        payload["audio_prompt_path"] = reference

    timeout = httpx.Timeout(_NATURAL_TTS_TIMEOUT_SECONDS, connect=1.0)
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url + "/synthesize", json=payload)
    if response.status_code != 200:
        detail = response.text[-600:]
        raise RuntimeError(f"Chatterbox HTTP {response.status_code}: {detail}")
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    engine = response.headers.get("X-SHINO-TTS", "chatterbox-v3")
    return response.content, engine, elapsed_ms


@router.post("/tts")
async def tts(body: TTSRequest) -> Response:
    global _tts_last_backend, _tts_last_error, _tts_last_ms

    text = body.text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")

    language_id = (body.language_id or _natural_tts_language()).strip() or "fr"
    natural_url = _natural_tts_url()
    if natural_url:
        try:
            result = await _natural_tts(text, language_id)
            if result is not None:
                audio, engine, elapsed_ms = result
                _tts_last_backend = engine
                _tts_last_error = ""
                _tts_last_ms = elapsed_ms
                return Response(
                    content=audio,
                    media_type="audio/wav",
                    headers={"X-SHINO-TTS": engine, "X-SHINO-TTS-MS": str(elapsed_ms)},
                )
        except Exception as exc:
            _tts_last_error = str(exc)[:800]
            logger.warning("SHINO natural TTS failed -> Piper fallback: {}", _tts_last_error)

    started = time.perf_counter()
    audio = await tts_engine.synthesize(text)
    _tts_last_backend = "piper"
    _tts_last_ms = round((time.perf_counter() - started) * 1000, 1)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-SHINO-TTS": "piper", "X-SHINO-TTS-MS": str(_tts_last_ms)},
    )
