"""Windows-only session tests; mock Frida, never attach to a real process."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tfhmod_runner', ROOT / 'runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class SessionTests(unittest.TestCase):
    def invoke(self, fake_frida):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'training-hook.js').write_text('mock __BASE__', encoding='utf-8')
            with patch.object(runner, '__file__', str(Path(directory) / 'runner.py')), \
                 patch.object(sys, 'argv', ['runner.py', '2147483646', '0x10000000']), \
                 patch.dict(sys.modules, {'frida': fake_frida}), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                result = runner.main()
            return result, output.getvalue()

    def test_attach_failure_is_reported(self):
        def attach(pid):
            raise RuntimeError('mock process missing')
        code, output = self.invoke(types.SimpleNamespace(attach=attach))
        self.assertEqual(code, 1)
        self.assertIn('mock process missing', output)

    def test_ready_and_game_exit_detach_cleanly(self):
        class Session:
            detached = False
            def on(self, event, callback):
                self.callback = callback
            def create_script(self, source):
                self.source = source
                return self
            def load(self):
                self.callback({'type':'send', 'payload':{'event':'ready'}}, None)
                detached_callback()
            def detach(self):
                self.detached = True
        session = Session()
        # Distinguish the session's detached callback and the script message callback.
        def on(event, callback):
            nonlocal detached_callback
            if event == 'detached':
                detached_callback = callback
            else:
                session.callback = callback
        detached_callback = None
        session.on = on
        fake = types.SimpleNamespace(attach=lambda pid:session, InvalidOperationError=RuntimeError)
        code, output = self.invoke(fake)
        self.assertEqual(code, 0)
        self.assertIn('Ready (v2.1.0)', output)
        self.assertTrue(session.detached)
        self.assertEqual(session.source, 'mock 0x10000000')


if __name__ == '__main__':
    unittest.main()
