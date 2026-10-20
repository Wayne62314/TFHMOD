import queue
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gui import Backend


class Script:
    def __init__(self, source):
        self.source = source
        self.exports_sync = self
        self.configurations = []

    def on(self, name, callback):
        self.message = callback

    def load(self):
        self.message({'type':'send', 'payload':{'event':'ready'}}, None)

    def configure(self, value):
        self.configurations.append(value)
        return value

    def shutdown(self):
        return {'pending':False}


class Session:
    def __init__(self):
        self.closed = False

    def on(self, name, callback):
        self.callback = callback

    def create_script(self, source):
        self.script = Script(source)
        return self.script

    def detach(self):
        self.closed = True
        self.callback()


class Tests(unittest.TestCase):
    def event(self, events, wanted):
        while True:
            kind, value = events.get(timeout=10)
            if kind == wanted:
                return value

    def test_connect_toggle_disconnect_and_quit(self):
        events = queue.Queue()
        session = Session()
        backend = Backend(events, finder=lambda:{'pid':2147483001, 'base':'0x10000000'},
                          attach=lambda pid:session)
        backend.start()
        try:
            backend.commands.put(('connect', {'bear':False,'boss':True}))
            value = self.event(events, 'connected')
            self.assertTrue(value['boss'])
            self.assertIn('let options = {"bear": false, "boss": true};', session.script.source)
            backend.commands.put(('configure', {'bear':True,'boss':False}))
            self.assertEqual(self.event(events, 'configured'), {'bear':True,'boss':False})
            backend.commands.put(('disconnect', None))
            self.event(events, 'disconnected')
            self.assertTrue(session.closed)
        finally:
            backend.commands.put(('quit', None))
            backend.thread.join(10)
            self.assertFalse(backend.thread.is_alive())

    def test_no_game_error_keeps_worker_usable(self):
        def finder():
            raise RuntimeError('mock no game')
        events = queue.Queue()
        backend = Backend(events, finder=finder)
        backend.start()
        try:
            backend.commands.put(('connect', {'bear':True,'boss':False}))
            self.assertIn('mock no game', self.event(events,'disconnected'))
            backend.commands.put(('configure', {'bear':False,'boss':False}))
            self.event(events,'log')
        finally:
            backend.commands.put(('quit',None))
            backend.thread.join(10)
            self.assertFalse(backend.thread.is_alive())


if __name__ == '__main__':
    unittest.main()
