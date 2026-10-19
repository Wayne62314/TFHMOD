"""Windows-only, session-scoped Huggles helper. Launch via Start-Huggles.ps1."""
import argparse
import json
import msvcrt
import os
import sys
from pathlib import Path
import tempfile
import threading


def main(argv=None):
    import frida

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    parser.add_argument('base', type=lambda value: int(value, 0))
    args = parser.parse_args(argv)
    if args.pid <= 0 or args.base <= 0:
        parser.error('PID and module base must be positive')
    root = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
    resource_root = Path(getattr(sys, '_MEIPASS', root))
    # Per-game-process lock shared by multiple copies of this published tool.
    lock_path = Path(tempfile.gettempdir()) / f'tfhmod-huggles-{args.pid}.lock'
    with lock_path.open('a+b') as lock:
        if os.fstat(lock.fileno()).st_size == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print('Another helper is already attached to this game. Close it first.')
            return 1
        session = None
        done, failed, ready = threading.Event(), threading.Event(), threading.Event()
        logs = root / 'logs'
        logs.mkdir(exist_ok=True)
        log_path = logs / f'training-hook-{args.pid}.jsonl'

        def message(msg, data):
            with log_path.open('a', encoding='utf-8') as log:
                log.write(json.dumps(msg, ensure_ascii=False) + '\n')
            if msg.get('type') == 'error':
                print('Hook error:', msg.get('description'), flush=True)
                failed.set()
                done.set()
                return
            payload = msg.get('payload', {})
            event = payload.get('event')
            if event == 'ready':
                ready.set()
                print('Ready (v2.1.0). LOCAL training / versus / CPU: choose Arizona as Player 1.', flush=True)
                print('Keep this window open. Do not use online. Ctrl+C stops the helper.', flush=True)
            elif event == 'replaced':
                print('Player 1: Arizona -> Huggles; opponent unchanged.', flush=True)
            elif event == 'error':
                print('Skipped:', payload.get('message'), flush=True)

        try:
            session = frida.attach(args.pid)
            session.on('detached', lambda *unused: done.set())
            source = (resource_root / 'training-hook.js').read_text(encoding='utf-8')
            script = session.create_script(source.replace('__BASE__', hex(args.base)))
            script.on('message', message)
            script.load()
            if not ready.is_set():
                for unused in range(100):
                    if ready.wait(0.1) or done.is_set():
                        break
            if not ready.is_set():
                print('Hook did not become ready; detaching.', flush=True)
                return 1
            while not done.wait(0.5):
                pass
        except KeyboardInterrupt:
            print('Stopping helper. Restart the game for a clean session.')
        except Exception as error:
            print(f'Unable to run helper: {error}', flush=True)
            return 1
        finally:
            if session is not None:
                try:
                    session.detach()
                except frida.InvalidOperationError:
                    pass
        return 1 if failed.is_set() else 0


if __name__ == '__main__':
    raise SystemExit(main())
