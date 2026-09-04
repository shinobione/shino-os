from __future__ import annotations

import asyncio
import os

import numpy as np
from fastapi import FastAPI, Request
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("SHINO_WHISPER_MODEL", "small").strip() or "small"
DEVICE = os.getenv("SHINO_WHISPER_DEVICE", "cuda").strip() or "cuda"
COMPUTE_TYPE = os.getenv("SHINO_WHISPER_COMPUTE", "float16").strip() or "float16"
PORT = int(os.getenv("SHINO_WHISPER_PORT", "8766"))

app = FastAPI(title="SHINO Whisper Node", version="0.1.0")
_model: WhisperModel | None = None
_model_lock = asyncio.Lock()


async def get_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model
    async with _model_lock:
        if _model is None:
            _model = await asyncio.to_thread(
                WhisperModel,
                MODEL_NAME,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
            )
    return _model


def run_transcribe(model: WhisperModel, pcm: bytes) -> str:
    audio = np.frombuffer(pcm, dtype=np.float32).copy()
    segments, _ = model.transcribe(
        audio,
        language="fr",
        beam_size=5,
        vad_filter=True,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "loaded": _model is not None,
    }


@app.post("/transcribe")
async def transcribe(request: Request) -> dict[str, object]:
    pcm = await request.body()
    if not pcm:
        return {"text": "", "model": MODEL_NAME, "device": DEVICE}
    model = await get_model()
    text = await asyncio.to_thread(run_transcribe, model, pcm)
    return {"text": text, "model": MODEL_NAME, "device": DEVICE}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
