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

app = FastAPI(title="SHINO Chatterbox TTS Worker", version="0.3.0")

_model = None
_model_lock = threading.Lock()
_synth_lock = threading.Lock()
_load_started_at = 0.0
_loaded_at = 0.0
_last_error = ""
_device = ""
_sample_rate = 0
_last_synth_ms = 0.0
_last_reference = ""
_last_reference_duration = 0.0
_synth_count = 0
_conditioned_reference = ""
_conditioned_reference_mtime = 0.0
_conditioning_ms = 0.0


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


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name) or str(default))
    except (TypeError, ValueError):
        return default


def _resolve_reference(body: SynthesisRequest) -> str | None:
    candidate = (body.audio_prompt_path or os.getenv("SHINO_CHATTERBOX_REFERENCE") or "").strip()
    if not candidate:
        return None
    path = Path(candidate).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Reference voix introuvable: {path}")
    return str(path)


def _env_reference() -> str | None:
    candidate = (os.getenv("SHINO_CHATTERBOX_REFERENCE") or "").strip()
    if not candidate:
        return None
    path = Path(candidate).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Reference voix introuvable: {path}")
    return str(path)


def _reference_duration(path: str | None) -> float:
    if not path:
        return 0.0
    try:
        with wave.open(path, "rb") as wf:
            rate = wf.getframerate()
            if rate <= 0:
                return 0.0
            return float(wf.getnframes()) / float(rate)
    except Exception:
        return 0.0


def _cuda_stats() -> dict[str, object]:
    if not torch.cuda.is_available():
        return {
            "cuda_available": False,
            "gpu": None,
            "cuda_allocated_mb": None,
            "cuda_reserved_mb": None,
            "cuda_free_mb": None,
            "cuda_total_mb": None,
        }
    try:
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        return {
            "cuda_available": True,
            "gpu": torch.cuda.get_device_name(0),
            "cuda_allocated_mb": round(torch.cuda.memory_allocated() / (1024 * 1024), 1),
            "cuda_reserved_mb": round(torch.cuda.memory_reserved() / (1024 * 1024), 1),
            "cuda_free_mb": round(free_bytes / (1024 * 1024), 1),
            "cuda_total_mb": round(total_bytes / (1024 * 1024), 1),
        }
    except Exception:
        return {
            "cuda_available": True,
            "gpu": torch.cuda.get_device_name(0),
            "cuda_allocated_mb": None,
            "cuda_reserved_mb": None,
            "cuda_free_mb": None,
            "cuda_total_mb": None,
        }


def _error_detail(exc: Exception) -> str:
    detail = f"{type(exc).__name__}: {exc}"
    stats = _cuda_stats()
    if stats.get("cuda_available"):
        detail += (
            f" | CUDA allocated={stats.get('cuda_allocated_mb')} MB"
            f", reserved={stats.get('cuda_reserved_mb')} MB"
            f", free={stats.get('cuda_free_mb')} MB"
            f", total={stats.get('cuda_total_mb')} MB"
        )
    return detail[:1800]


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
            _last_error = _error_detail(exc)
            _model = None
            raise


def _prepare_reference_once(model, reference: str | None, exaggeration: float) -> None:
    global _conditioned_reference, _conditioned_reference_mtime, _conditioning_ms
    global _last_reference, _last_reference_duration

    if not reference:
        return

    path = Path(reference)
    mtime = path.stat().st_mtime
    _last_reference = reference
    _last_reference_duration = _reference_duration(reference)

    if _conditioned_reference == reference and _conditioned_reference_mtime == mtime:
        return

    started = time.perf_counter()
    model.prepare_conditionals(reference, exaggeration=exaggeration)
    _conditioning_ms = round((time.perf_counter() - started) * 1000, 1)
    _conditioned_reference = reference
    _conditioned_reference_mtime = mtime


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
    result = {
        "ok": True,
        "engine": "chatterbox-multilingual-v3",
        "loaded": loaded,
        "loading": bool(_load_started_at and not loaded and not _last_error),
        "device": _device or None,
        "sample_rate": _sample_rate or None,
        "last_error": _last_error or None,
        "last_synth_ms": _last_synth_ms or None,
        "synth_count": _synth_count,
        "conditioned_reference": _conditioned_reference or None,
        "last_reference": _last_reference or None,
        "reference_duration_s": round(_last_reference_duration, 2) if _last_reference_duration else None,
        "conditioning_ms": _conditioning_ms or None,
        "ready": bool(loaded and (not (os.getenv("SHINO_CHATTERBOX_REFERENCE") or "").strip() or _conditioned_reference)),
    }
    result.update(_cuda_stats())
    return result


@app.post("/warmup")
def warmup() -> dict[str, object]:
    started = time.perf_counter()
    try:
        with _synth_lock:
            model = _ensure_model()
            reference = _env_reference()
            if reference:
                _prepare_reference_once(
                    model,
                    reference,
                    _env_float("SHINO_CHATTERBOX_EXAGGERATION", 0.65),
                )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=_error_detail(exc)) from exc
    result = {
        "ok": True,
        "engine": "chatterbox-multilingual-v3",
        "device": _device,
        "sample_rate": int(model.sr),
        "load_ms": round((time.perf_counter() - started) * 1000, 1),
        "conditioned_reference": _conditioned_reference or None,
        "conditioning_ms": _conditioning_ms or None,
        "ready": True,
    }
    result.update(_cuda_stats())
    return result


@app.post("/synthesize")
def synthesize(body: SynthesisRequest) -> Response:
    global _last_error, _last_synth_ms, _last_reference, _last_reference_duration, _synth_count

    text = body.text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")
    if len(text) > 1200:
        raise HTTPException(status_code=413, detail="Segment TTS trop long (>1200 caracteres)")

    try:
        with _synth_lock:
            model = _ensure_model()
            reference = _resolve_reference(body)
            _last_reference = reference or ""
            _last_reference_duration = _reference_duration(reference)
            _prepare_reference_once(model, reference, body.exaggeration)

            kwargs = {
                "language_id": body.language_id or "fr",
                "exaggeration": body.exaggeration,
                "cfg_weight": body.cfg_weight,
                "temperature": body.temperature,
            }
            started = time.perf_counter()
            wav = model.generate(text, audio_prompt_path=None, **kwargs)
            infer_ms = round((time.perf_counter() - started) * 1000, 1)
            payload = _to_wav_bytes(wav, int(model.sr))
            _last_synth_ms = infer_ms
            _synth_count += 1
            _last_error = ""
    except Exception as exc:
        _last_error = _error_detail(exc)
        raise HTTPException(status_code=500, detail=_last_error) from exc

    return Response(
        content=payload,
        media_type="audio/wav",
        headers={
            "X-SHINO-TTS": "chatterbox-v3",
            "X-SHINO-TTS-DEVICE": _device,
            "X-SHINO-TTS-MS": str(infer_ms),
            "X-SHINO-TTS-REF": "1" if _last_reference else "0",
        },
    )
