"""Worker contract tests with a fake model; no Torch/GPU/model downloads."""
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('worker', ROOT / 'workers/chatterbox_tts/server.py')
worker = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'torch': types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: False))}):
    spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def test_conditioning_cache_includes_exaggeration(self):
        with tempfile.NamedTemporaryFile(suffix='.wav') as reference:
            model = Mock()
            worker._prepare_reference_once(model, reference.name, .65)
            worker._prepare_reference_once(model, reference.name, .65)
            self.assertEqual(model.prepare_conditionals.call_count, 1)
            worker._prepare_reference_once(model, reference.name, .5)
            self.assertEqual(model.prepare_conditionals.call_count, 2)

    def test_synthesis_returns_wav_and_chatterbox_label(self):
        model = types.SimpleNamespace(sr=24000, generate=Mock(return_value=np.zeros(64)))
        with patch.object(worker, '_ensure_model', return_value=model), patch.object(worker, '_resolve_reference', return_value=None):
            response = worker.synthesize(worker.SynthesisRequest(text='Bonjour.'))
        self.assertEqual(response.body[:4], b'RIFF')
        self.assertEqual(response.headers['X-SHINO-TTS'], 'chatterbox-v3')

    def test_cold_health_is_not_ready(self):
        with patch.object(worker, '_model', None):
            result = worker.health()
        self.assertEqual(result['engine'], 'chatterbox-multilingual-v3')
        self.assertFalse(result['ready'])


if __name__ == '__main__':
    unittest.main()
