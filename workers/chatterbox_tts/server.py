from __future__ import annotations

import io
import os
import threading
import time
import wave
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

app = FastAPI(title="SHINO Chatterbox TTS Worker", version="0.1.0")

_model = None
_model_lock = threading.Lock()
_load_started_at = 0.0
_loaded_at = 0.0
_last_error = ""
_device = ""
_sample_rate = 0


class SynthesisRequest(BaseModel):
    text: str
    language_id: str = "fr"
    audio_prompt_path: str | None = None
    exaggeration: float = Field(default=0.5, ge=0.0, le=2.0)
    cfg_weight: float = Field(default=0.4, ge=0.0, le=1.0)
    temperature: float = Field(default=0.8, ge=0.1, le=2.0)


def _select_device() -> str:
    requested = (os.getenv("SHINO_CHATTERBOX_DEVICE") or "auto").strip().lower()
    if requested == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("SHINO_CHATTERBOX_DEVICE=cuda mais torch.cuda.is_available() est False")
    return requested


def _resolve_reference(body: SynthesisRequest) -> str | None:
    candidate = (body.audio_prompt_path or os.getenv("SHINO_CHATTERBOX_REFERENCE") or "").strip()
    if not candidate:
        return None
    path = Path(candidate).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Reference voix introuvable: {path}")
    return str(path)


def _ensure_model():
    global _model, _load_started_at, _loaded_at, _last_error, _device, _sample_rate
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        _load_started_at = time.perf_counter()
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            _device = _select_device()
            _model = ChatterboxMultilingualTTS.from_pretrained(device=_device, t3_model="v3")
            _sample_rate = int(_model.sr)
            _loaded_at = time.perf_counter()
            _last_error = ""
            return _model
        except Exception as exc:
            _last_error = str(exc)[:1000]
            _model = None
            raise


def _to_wav_bytes(wav_tensor, sample_rate: int) -> bytes:
    if hasattr(wav_tensor, "detach"):
        audio = wav_tensor.detach().float().cpu().numpy()
    else:
        audio = np.asarray(wav_tensor, dtype=np.float32)
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    if audio.ndim != 1:
        audio = audio.reshape(-1)
    audio = np.nan_to_num(audio, nan=0.0, posinf=1.0, neginf=-1.0)
    audio = np.clip(audio, -1.0, 1.0)
    pcm16 = np.rint(audio * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


@app.get("/health")
def health() -> dict[str, object]:
    loaded = _model is not None
    return {
        "ok": True,
        "engine": "chatterbox-multilingual-v3",
        "loaded": loaded,
        "loading": bool(_load_started_at and not loaded and not _last_error),
        "device": _device or None,
        "cuda_available": bool(torch.cuda.is_available()),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "sample_rate": _sample_rate or None,
        "last_error": _last_error or None,
    }


@app.post("/warmup")
def warmup() -> dict[str, object]:
    started = time.perf_counter()
    try:
        model = _ensure_model()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "ok": True,
        "engine": "chatterbox-multilingual-v3",
        "device": _device,
        "sample_rate": int(model.sr),
        "load_ms": round((time.perf_counter() - started) * 1000, 1),
    }


@app.post("/synthesize")
def synthesize(body: SynthesisRequest) -> Response:
    text = body.text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")
    if len(text) > 1200:
        raise HTTPException(status_code=413, detail="Segment TTS trop long (>1200 caracteres)")

    try:
        model = _ensure_model()
        reference = _resolve_reference(body)
        kwargs = {
            "language_id": body.language_id or "fr",
            "exaggeration": body.exaggeration,
            "cfg_weight": body.cfg_weight,
            "temperature": body.temperature,
        }
        if reference:
            kwargs["audio_prompt_path"] = reference
        started = time.perf_counter()
        wav = model.generate(text, **kwargs)
        infer_ms = round((time.perf_counter() - started) * 1000, 1)
        payload = _to_wav_bytes(wav, int(model.sr))
    except Exception as exc:
        global _last_error
        _last_error = str(exc)[:1000]
        raise HTTPException(status_code=500, detail=_last_error) from exc

    return Response(
        content=payload,
        media_type="audio/wav",
        headers={
            "X-SHINO-TTS": "chatterbox-v3",
            "X-SHINO-TTS-DEVICE": _device,
            "X-SHINO-TTS-MS": str(infer_ms),
        },
    )
