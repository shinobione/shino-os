"""SHINO-only Ollama residency; no chat/session/memory side effects."""
import asyncio
from contextlib import asynccontextmanager
import os
import re

import httpx
from loguru import logger


def ollama_options():
    if os.getenv("SHINO_OS") != "1":
        return {}
    value = os.getenv("SHINO_OLLAMA_KEEP_ALIVE", "15m").strip() or "15m"
    if not re.fullmatch(r"(?:-1|0|\d+(?:\.\d+)?(?:ms|s|m|h))", value):
        logger.warning("SHINO Ollama keep-alive invalid; using 15m")
        value = "15m"
    return {"keep_alive": int(value) if value in ("-1", "0") else value}


async def warmup(settings, state):
    """Bound the entire attempt, including connect/load/read. Never use gateway."""
    state["status"] = "warming"
    try:
        async with asyncio.timeout(90):
            async with httpx.AsyncClient(timeout=85) as client:
                response = await client.post(
                    settings.ollama_base_url.rstrip("/") + "/api/chat",
                    json={"model": settings.ollama_model,
                          "messages": [{"role": "user", "content": "OK"}],
                          "stream": False, "think": False,
                          "options": {"num_predict": 1}, **ollama_options()},
                )
                response.raise_for_status()
                if response.json().get("done") is not True:
                    raise ValueError("incomplete warmup")
        state["status"] = "ready"
        logger.info("SHINO Ollama warmup ready")
    except asyncio.CancelledError:
        state["status"] = "cancelled"
        raise
    except Exception as exc:
        state["status"] = "failed"
        state["error"] = type(exc).__name__
        logger.warning("SHINO Ollama warmup failed ({}) — startup continues", type(exc).__name__)


def install(app):
    if os.getenv("SHINO_OS") != "1" or getattr(app.state, "shino_ollama_installed", False):
        return
    app.state.shino_ollama_installed = True
    app.state.shino_ollama = {"status": "pending", "error": None}
    original = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        async with original(application) as value:
            from jarvis.kernel.settings import settings
            task = None
            if settings.llm_provider == "local" and not getattr(application.state, "shino_warmup_started", False):
                application.state.shino_warmup_started = True
                task = asyncio.create_task(warmup(settings, application.state.shino_ollama))
            try:
                yield value
            finally:
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

    app.router.lifespan_context = lifespan
