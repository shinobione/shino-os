from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from jarvis.kernel.settings import settings
from jarvis.providers.audio.stt import transcribe as local_transcribe
from jarvis.providers.audio.tts import tts_engine

router = APIRouter(prefix="/api/shino/voice", tags=["shino-local-voice"])

_MAX_PCM_BYTES = 12 * 1024 * 1024


class TTSRequest(BaseModel):
    text: str


@router.get("/status")
async def status() -> dict[str, object]:
    remote = os.getenv("SHINO_STT_URL", "").strip()
    return {
        "ok": True,
        "stt": "lan" if remote else "local",
        "stt_url": remote or None,
        "whisper_model": settings.whisper_model,
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
    pcm = await request.body()
    if not pcm:
        return {"text": "", "backend": "empty"}
    if len(pcm) > _MAX_PCM_BYTES:
        return {"text": "", "backend": "rejected", "error": "audio_too_large"}

    remote = os.getenv("SHINO_STT_URL", "").strip()
    if remote:
        try:
            text = await _remote_transcribe(remote, pcm)
            return {"text": text, "backend": "lan", "url": remote}
        except Exception as exc:
            # The workstation must remain usable if the LAN GPU node is sleeping.
            fallback_error = str(exc)[:180]
        else:
            fallback_error = ""
    else:
        fallback_error = ""

    text = await local_transcribe(pcm)
    payload: dict[str, object] = {
        "text": text,
        "backend": "local",
        "model": settings.whisper_model,
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
