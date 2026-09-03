from __future__ import annotations

import asyncio
import os
import time

import httpx
from fastapi import APIRouter, Request, Response
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio import stt as local_stt
from jarvis.providers.audio.tts import tts_engine

router = APIRouter(prefix="/api/shino/voice", tags=["shino-local-voice"])

_MAX_PCM_BYTES = 12 * 1024 * 1024
_stt_lock = asyncio.Lock()
_stt_phase = "cold"
_stt_started_at = 0.0
_stt_last_ms: float | None = None
_stt_last_error = ""


class TTSRequest(BaseModel):
    text: str


def _local_model_loaded() -> bool:
    return getattr(local_stt, "_model", None) is not None


@router.get("/status")
async def status() -> dict[str, object]:
    remote = os.getenv("SHINO_STT_URL", "").strip()
    loaded = _local_model_loaded()
    phase = _stt_phase
    if not remote and phase == "cold" and loaded:
        phase = "ready"
    elapsed_ms = None
    if _stt_started_at and phase in {"loading", "transcribing", "lan"}:
        elapsed_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
    return {
        "ok": True,
        "stt": "lan" if remote else "local",
        "stt_url": remote or None,
        "stt_phase": phase,
        "whisper_loaded": loaded,
        "whisper_model": settings.whisper_model,
        "stt_elapsed_ms": elapsed_ms,
        "stt_last_ms": _stt_last_ms,
        "stt_last_error": _stt_last_error or None,
        "tts": settings.tts_provider,
        "llm": settings.llm_provider,
    }


async def _remote_transcribe(remote: str, pcm: bytes) -> str:
    url = remote.rstrip("/") + "/transcribe"
    async with httpx.AsyncClient(timeout=45.0) as client:
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

    pcm = await request.body()
    if not pcm:
        return {"text": "", "backend": "empty"}
    if len(pcm) > _MAX_PCM_BYTES:
        return {"text": "", "backend": "rejected", "error": "audio_too_large"}

    async with _stt_lock:
        _stt_started_at = time.perf_counter()
        _stt_last_error = ""
        remote = os.getenv("SHINO_STT_URL", "").strip()

        if remote:
            _stt_phase = "lan"
            try:
                logger.info("SHINO STT LAN start: {} bytes -> {}", len(pcm), remote)
                text = await _remote_transcribe(remote, pcm)
                _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
                _stt_phase = "ready"
                logger.info("SHINO STT LAN done: {} ms, {} chars", _stt_last_ms, len(text))
                return {
                    "text": text,
                    "backend": "lan",
                    "url": remote,
                    "duration_ms": _stt_last_ms,
                }
            except Exception as exc:
                # The workstation must remain usable if the LAN GPU node is sleeping.
                fallback_error = str(exc)[:180]
                _stt_last_error = fallback_error
                logger.warning("SHINO STT LAN failed -> local fallback: {}", fallback_error)
        else:
            fallback_error = ""

        was_loaded = _local_model_loaded()
        _stt_phase = "transcribing" if was_loaded else "loading"
        logger.info(
            "SHINO STT local start: model={}, loaded={}, pcm_bytes={}",
            settings.whisper_model,
            was_loaded,
            len(pcm),
        )
        try:
            text = await local_stt.transcribe(pcm)
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_phase = "ready"
            logger.info("SHINO STT local done: {} ms, {} chars", _stt_last_ms, len(text))
        except Exception as exc:
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_phase = "error"
            _stt_last_error = str(exc)[:240]
            logger.exception("SHINO STT local failed after {} ms", _stt_last_ms)
            raise

        payload: dict[str, object] = {
            "text": text,
            "backend": "local",
            "model": settings.whisper_model,
            "duration_ms": _stt_last_ms,
            "cold_start": not was_loaded,
        }
        if fallback_error:
            payload["lan_fallback"] = fallback_error
        return payload


@router.post("/tts")
async def tts(body: TTSRequest) -> Response:
    text = body.text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")
    audio = await tts_engine.synthesize(text)
    return Response(content=audio, media_type="audio/wav")
