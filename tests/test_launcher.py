import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tfhmod_launcher', ROOT / 'launcher.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_no_game_reports_actionable_error(self):
        with patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(RuntimeError, 'Steam'):
                launcher.find_game()

    def test_version_gate_and_process_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Them's Fightin' Herds.exe"
            path.write_bytes(b'test game placeholder, not executable')
            result = types.SimpleNamespace(returncode=0, stdout=json.dumps({'pid':123, 'path':str(path), 'base':'0x12340000'}))
            with patch.object(subprocess, 'run', return_value=result):
                with self.assertRaisesRegex(RuntimeError, '版本不匹配'):
                    launcher.find_game()
                digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
                with patch.object(launcher, 'GAME_HASH', digest):
                    self.assertEqual(launcher.find_game()['pid'], 123)


if __name__ == '__main__':
    unittest.main()
