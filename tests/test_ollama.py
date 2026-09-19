"""No runtime imports, servers, models or GPU; exercise actual overlay lifecycle."""
import asyncio
from contextlib import asynccontextmanager
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("shino_ollama", ROOT / "runtime_overlay/jarvis/interfaces/api/shino_ollama.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OllamaTests(unittest.IsolatedAsyncioTestCase):
    def test_keep_alive_config_and_non_shino(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(module.ollama_options(), {})
            os.environ['SHINO_OS'] = '1'
            self.assertEqual(module.ollama_options(), {'keep_alive': '15m'})
            for value, expected in [('30m', '30m'), ('2h', '2h'), ('-1', -1), ('0', 0), ('bad', '15m')]:
                os.environ['SHINO_OLLAMA_KEEP_ALIVE'] = value
                self.assertEqual(module.ollama_options(), {'keep_alive': expected})

    async def exercise(self, fail=False):
        requests = []
        release = asyncio.Event()
        entered = asyncio.Event()
        async def handler(request):
            requests.append(request)
            entered.set()
            await release.wait()
            if fail:
                raise httpx.ConnectError('unavailable')
            return httpx.Response(200, json={'done': True})
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        settings = types.SimpleNamespace(llm_provider='local', ollama_base_url='http://configured-service:12345', ollama_model='qwen3:8b-q4_K_M')
        app = FastAPI()
        app.state.sessions = ['untouched']
        @asynccontextmanager
        async def original(application):
            application.state.usable = True
            yield
        app.router.lifespan_context = original
        with patch.dict(os.environ, {'SHINO_OS': '1', 'SHINO_OLLAMA_KEEP_ALIVE': '17m'}), patch.dict(sys.modules, {'jarvis.kernel.settings': types.SimpleNamespace(settings=settings)}), patch.object(module.httpx, 'AsyncClient', return_value=client):
            module.install(app)
            wrapper = app.router.lifespan_context
            module.install(app)
            self.assertIs(wrapper, app.router.lifespan_context)
            async with wrapper(app):
                self.assertTrue(app.state.usable)
                # Startup completes even while the warmup request is held.
                await asyncio.wait_for(entered.wait(), 1)
                self.assertEqual(app.state.shino_ollama['status'], 'warming')
                release.set()
                for _ in range(20):
                    await asyncio.sleep(0)
                    if app.state.shino_ollama['status'] != 'warming':
                        break
                self.assertEqual(app.state.shino_ollama['status'], 'failed' if fail else 'ready')
            async with wrapper(app):
                await asyncio.sleep(0)
        self.assertEqual(len(requests), 1)
        self.assertEqual(app.state.sessions, ['untouched'])
        self.assertEqual(str(requests[0].url), 'http://configured-service:12345/api/chat')
        payload = json.loads(requests[0].content)
        self.assertEqual(payload['keep_alive'], '17m')
        self.assertEqual(payload['model'], settings.ollama_model)
        self.assertNotIn('session_id', payload)
        self.assertEqual(payload['options']['num_predict'], 1)

    async def test_warmup_once_without_history_or_startup_blocking(self):
        await self.exercise()

    async def test_warmup_failure_does_not_fail_startup(self):
        await self.exercise(fail=True)

    async def test_warmup_timeout_is_nonfatal(self):
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: (_ for _ in ()).throw(httpx.ReadTimeout('timeout'))))
        state = {}
        with patch.object(module.httpx, 'AsyncClient', return_value=client):
            await module.warmup(types.SimpleNamespace(ollama_base_url='http://mock', ollama_model='qwen'), state)
        self.assertEqual(state['status'], 'failed')

    async def test_entire_warmup_has_deadline(self):
        async def handler(request):
            await asyncio.Event().wait()
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        state = {}
        real_timeout = asyncio.timeout
        with patch.object(module.httpx, 'AsyncClient', return_value=client), patch.object(module.asyncio, 'timeout', side_effect=lambda seconds: real_timeout(.01)):
            await module.warmup(types.SimpleNamespace(ollama_base_url='http://mock', ollama_model='qwen'), state)
        self.assertEqual(state['status'], 'failed')
        self.assertEqual(state['error'], 'TimeoutError')

    def test_install_outside_shino_unchanged(self):
        with patch.dict(os.environ, {}, clear=True):
            app = FastAPI()
            original = app.router.lifespan_context
            module.install(app)
            self.assertIs(app.router.lifespan_context, original)
