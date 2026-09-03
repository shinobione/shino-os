from __future__ import annotations

import asyncio
import os
import time

import httpx
import numpy as np
from fastapi import APIRouter, Request, Response
from faster_whisper import WhisperModel
from loguru import logger
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio.tts import tts_engine

router = APIRouter(prefix="/api/shino/voice", tags=["shino-local-voice"])

_MAX_PCM_BYTES = 12 * 1024 * 1024
_stt_lock = asyncio.Lock()
_model_lock = asyncio.Lock()
_stt_phase = "cold"
_stt_started_at = 0.0
_stt_last_ms: float | None = None
_stt_last_error = ""
_shino_model: WhisperModel | None = None
_shino_model_name = ""
_shino_device = "cold"
_shino_compute = ""
_shino_fallback_reason = ""


class TTSRequest(BaseModel):
    text: str


def _requested_model() -> str:
    return (os.getenv("SHINO_WHISPER_MODEL") or settings.whisper_model or "small").strip()


def _cpu_model() -> str:
    # CPU is only an emergency fallback. A smaller model keeps voice interactive.
    return (os.getenv("SHINO_WHISPER_CPU_MODEL") or "base").strip()


async def _build_model() -> WhisperModel:
    global _shino_model, _shino_model_name, _shino_device, _shino_compute, _shino_fallback_reason

    if _shino_model is not None:
        return _shino_model

    async with _model_lock:
        if _shino_model is not None:
            return _shino_model

        requested = _requested_model()
        forced = (os.getenv("SHINO_WHISPER_DEVICE") or "cuda").strip().lower()

        if forced != "cpu":
            try:
                logger.info("SHINO Whisper: initialisation CUDA model={} float16", requested)
                model = await asyncio.to_thread(
                    WhisperModel,
                    requested,
                    device="cuda",
                    compute_type="float16",
                )
                _shino_model = model
                _shino_model_name = requested
                _shino_device = "cuda"
                _shino_compute = "float16"
                _shino_fallback_reason = ""
                logger.info("SHINO Whisper: CUDA prêt model={}", requested)
                return model
            except Exception as exc:
                _shino_fallback_reason = str(exc)[:300]
                logger.warning("SHINO Whisper CUDA indisponible -> CPU int8: {}", _shino_fallback_reason)

        cpu_name = _cpu_model()
        logger.info("SHINO Whisper: initialisation CPU model={} int8", cpu_name)
        model = await asyncio.to_thread(
            WhisperModel,
            cpu_name,
            device="cpu",
            compute_type="int8",
            cpu_threads=max(2, min(8, os.cpu_count() or 4)),
        )
        _shino_model = model
        _shino_model_name = cpu_name
        _shino_device = "cpu"
        _shino_compute = "int8"
        logger.info("SHINO Whisper: CPU prêt model={} int8", cpu_name)
        return model


def _run_transcribe(model: WhisperModel, pcm: bytes) -> str:
    audio = np.frombuffer(pcm, dtype=np.float32).copy()
    segments, _ = model.transcribe(
        audio,
        language="fr",
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


async def _rebuild_cpu_after_cuda_failure(reason: str) -> WhisperModel:
    global _shino_model, _shino_model_name, _shino_device, _shino_compute, _shino_fallback_reason
    async with _model_lock:
        _shino_model = None
        _shino_fallback_reason = reason[:300]
        cpu_name = _cpu_model()
        logger.warning("SHINO Whisper CUDA runtime failure -> CPU {} int8: {}", cpu_name, reason[:220])
        model = await asyncio.to_thread(
            WhisperModel,
            cpu_name,
            device="cpu",
            compute_type="int8",
            cpu_threads=max(2, min(8, os.cpu_count() or 4)),
        )
        _shino_model = model
        _shino_model_name = cpu_name
        _shino_device = "cpu"
        _shino_compute = "int8"
        return model


async def _local_transcribe(pcm: bytes) -> str:
    model = await _build_model()
    try:
        return await asyncio.to_thread(_run_transcribe, model, pcm)
    except Exception as exc:
        # Missing CUDA/cuDNN DLLs can surface only on the first inference rather
        # than during model construction. Retry once on a fast CPU int8 fallback.
        if _shino_device == "cuda":
            cpu_model = await _rebuild_cpu_after_cuda_failure(str(exc))
            return await asyncio.to_thread(_run_transcribe, cpu_model, pcm)
        raise


@router.get("/status")
async def status() -> dict[str, object]:
    remote = os.getenv("SHINO_STT_URL", "").strip()
    loaded = _shino_model is not None
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
        "whisper_model": _shino_model_name or _requested_model(),
        "whisper_requested_model": _requested_model(),
        "stt_device": "lan" if remote else _shino_device,
        "stt_compute": _shino_compute or None,
        "stt_fallback_reason": _shino_fallback_reason or None,
        "stt_elapsed_ms": elapsed_ms,
        "stt_last_ms": _stt_last_ms,
        "stt_last_error": _stt_last_error or None,
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
                    "device": "lan",
                }
            except Exception as exc:
                fallback_error = str(exc)[:180]
                _stt_last_error = fallback_error
                logger.warning("SHINO STT LAN failed -> local fallback: {}", fallback_error)
        else:
            fallback_error = ""

        was_loaded = _shino_model is not None
        _stt_phase = "transcribing" if was_loaded else "loading"
        logger.info(
            "SHINO STT local start: requested_model={}, loaded={}, device={}, pcm_bytes={}",
            _requested_model(),
            was_loaded,
            _shino_device,
            len(pcm),
        )
        try:
            text = await _local_transcribe(pcm)
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_phase = "ready"
            logger.info(
                "SHINO STT local done: {} ms, {} chars, model={}, device={}, compute={}",
                _stt_last_ms,
                len(text),
                _shino_model_name,
                _shino_device,
                _shino_compute,
            )
        except Exception as exc:
            _stt_last_ms = round((time.perf_counter() - _stt_started_at) * 1000, 1)
            _stt_phase = "error"
            _stt_last_error = str(exc)[:240]
            logger.exception("SHINO STT local failed after {} ms", _stt_last_ms)
            raise

        payload: dict[str, object] = {
            "text": text,
            "backend": "local",
            "model": _shino_model_name,
            "device": _shino_device,
            "compute": _shino_compute,
            "duration_ms": _stt_last_ms,
            "cold_start": not was_loaded,
        }
        if _shino_fallback_reason:
            payload["device_fallback"] = _shino_fallback_reason
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
