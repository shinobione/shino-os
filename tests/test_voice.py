"""No GPU, microphone, real runtime imports or network calls."""
import asyncio
import importlib.util
import io
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch
import wave

import httpx

ROOT = Path(__file__).resolve().parents[1]
settings = types.SimpleNamespace(tts_provider="piper", llm_provider="local")
fallback = types.SimpleNamespace(synthesize=AsyncMock(return_value=b"fallback"))
sys.modules["jarvis.kernel.settings"] = types.SimpleNamespace(settings=settings)
sys.modules["jarvis.providers.audio.tts"] = types.SimpleNamespace(tts_engine=fallback)
spec = importlib.util.spec_from_file_location("voice", ROOT / "runtime_overlay/jarvis/interfaces/api/shino_local_voice.py")
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


def wav_bytes():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b"\0\0" * 64)
    return buffer.getvalue()


class VoiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        fallback.synthesize.reset_mock()
        self.env = patch.dict(os.environ, {"SHINO_TTS_URL": ""})
        self.env.start()
        self.addCleanup(self.env.stop)

    def client(self, handler):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        return patch.object(voice.httpx, "AsyncClient", return_value=client)

    async def test_blank_startup_url_still_tries_chatterbox(self):
        def handler(request):
            self.assertEqual(str(request.url), "http://127.0.0.1:18765/synthesize")
            return httpx.Response(200, content=wav_bytes(), headers={"X-SHINO-TTS": "chatterbox-v3"})
        with self.client(handler):
            response = await voice.tts(voice.TTSRequest(text="Bonjour."))
        self.assertEqual(response.headers["X-SHINO-TTS"], "chatterbox-v3")
        fallback.synthesize.assert_not_called()

    async def test_failure_is_documented_and_next_phrase_recovers(self):
        previous_count = voice._tts_fallback_count
        with self.client(lambda request: httpx.Response(503, text="CUDA unavailable")):
            response = await voice.tts(voice.TTSRequest(text="Bonjour."))
        self.assertEqual(response.headers["X-SHINO-TTS-FALLBACK"], "chatterbox-failed")
        self.assertIn("503", voice._tts_last_error)
        fallback.synthesize.assert_awaited_once()
        with self.client(lambda request: httpx.Response(200, content=wav_bytes())):
            response = await voice.tts(voice.TTSRequest(text="Retour."))
        self.assertEqual(response.headers["X-SHINO-TTS"], "chatterbox-v3")
        self.assertEqual(voice._tts_last_error, "")
        self.assertEqual(voice._tts_fallback_count, previous_count + 1)
        self.assertIn('503', voice._tts_last_fallback_error)
        self.assertEqual(fallback.synthesize.await_count, 1)

    async def test_timeout_has_nonempty_diagnostic(self):
        def handler(request):
            raise httpx.ReadTimeout("", request=request)
        with self.client(handler):
            await voice.tts(voice.TTSRequest(text="Bonjour."))
        self.assertIn("ReadTimeout", voice._tts_last_error)

    async def test_invalid_audio_falls_back(self):
        with self.client(lambda request: httpx.Response(200, content=b"not audio")):
            response = await voice.tts(voice.TTSRequest(text="Bonjour."))
        self.assertEqual(response.headers["X-SHINO-TTS"], "piper")
        self.assertIn("invalid WAV", voice._tts_last_error)

    async def test_cancel_does_not_start_piper(self):
        with patch.object(voice, "_natural_tts", side_effect=asyncio.CancelledError):
            with self.assertRaises(asyncio.CancelledError):
                await voice.tts(voice.TTSRequest(text="Bonjour."))
        fallback.synthesize.assert_not_called()


if __name__ == "__main__":
    unittest.main()
