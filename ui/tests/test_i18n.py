import ast
from pathlib import Path
import queue
import re
import sys
import tkinter as tk
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from gui import App
from i18n import translate

class DummyBackend:
    def __init__(self): self.commands = queue.Queue()
    def start(self): pass

class LanguageTests(unittest.TestCase):
    def test_static_chinese_strings_have_english_display(self):
        tree = ast.parse((ROOT / 'gui.py').read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and re.search('[\u4e00-\u9fff]', node.value):
                if node.value == '中文':  # Deliberate switch-back label in English mode.
                    continue
                with self.subTest(text=node.value):
                    self.assertFalse(re.search('[\u4e00-\u9fff]', translate(node.value, 'en')))

    def test_dynamic_status_and_errors_translate(self):
        self.assertIn('PID 123', translate('已连接游戏 · PID 123 · 等待重新选角进场', 'en'))
        self.assertEqual(translate('操作失败：另一个 TFHMOD 工具正在使用该游戏，请先关闭旧工具。', 'en'),
                         'Operation failed: Another TFHMOD tool is connected. Close the old tool first.')

    def test_connected_toggle_preserves_options_and_never_sends_backend_commands(self):
        root = tk.Tk(); root.withdraw(); backend = DummyBackend()
        try:
            app = App(root, backend=backend)
            app.connected = True; app.bear.set(False); app.phase3.set(True)
            original = app.options()
            app.set_status('已连接游戏 · PID 123 · 等待重新选角进场')
            app.append('已请求追踪弹。')
            app.toggle_language()
            self.assertEqual(app.options(), original)
            self.assertTrue(backend.commands.empty())
            self.assertEqual(app.connect_button.cget('text'), 'Connect to game')
            self.assertEqual(app.language_button.cget('text'), '中文')
            self.assertIn('Homing spark requested.', app.log.get('1.0','end'))
            self.assertIn('Connected', app.status.get())
            with patch('gui.os.startfile') as open_file:
                app.open_help()
                self.assertEqual(open_file.call_args.args[0].name, 'USAGE.en.txt')
                self.assertTrue(open_file.call_args.args[0].is_file())
            app.toggle_language()
            self.assertEqual(app.status.get(), '已连接游戏 · PID 123 · 等待重新选角进场')
            self.assertIn('已请求追踪弹。', app.log.get('1.0','end'))
            self.assertTrue(backend.commands.empty())
            with self.assertRaises(ValueError): app.set_language('invalid')
        finally: root.destroy()

if __name__ == '__main__': unittest.main()
