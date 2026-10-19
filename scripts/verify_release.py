"""Extract ZIP and smoke-test with no Python-related PATH entries. Never attach."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='TFHMOD 分享版测试 ') as directory:
    root = Path(directory)
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            if not (root / name).resolve().is_relative_to(root):
                raise SystemExit('Unsafe archive path')
        source.extractall(root)
    exe = root / 'TFHMOD' / 'TFHMOD.exe'
    env = dict(os.environ)
    env['PATH'] = str(Path(os.environ['SystemRoot']) / 'System32')
    for key in ['PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV']:
        env.pop(key, None)
    result = subprocess.run([str(exe), '--self-test'], cwd=root, env=env,
                            capture_output=True, text=True, timeout=30)
    print(result.stdout.strip())
    if result.returncode or 'PASS TFHMOD 2.1.0' not in result.stdout:
        print(result.stderr)
        raise SystemExit('Portable self-test failed')
    help_result = subprocess.run([str(exe), '--help'], cwd=root, env=env,
                                 capture_output=True, timeout=15)
    assert help_result.returncode == 0
    assert not (exe.parent / 'logs').exists(), 'Self-test unexpectedly created session logs'
    print('PASS: fresh ZIP extraction; Chinese/spaced path; Python-free PATH; no game attachment.')
