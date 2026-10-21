"""Package GUI with runtime notices, no game files or test session logs."""
import hashlib
import importlib.metadata
from pathlib import Path
import shutil
import sys
import zipfile

root = Path(__file__).resolve().parent
bundle = root / 'dist-251' / 'TFHMOD'
for name in ['README.md', 'README.en.md', 'USAGE.en.txt', 'USAGE.zh-CN.txt', 'THIRD_PARTY_NOTICES.txt']:
    shutil.copy2(root / name, bundle / name)
licenses = bundle / 'licenses'
licenses.mkdir(exist_ok=True)
shutil.copy2(Path(sys.base_prefix) / 'LICENSE.txt', licenses / 'Python-LICENSE.txt')
shutil.copytree(root / 'third_party' / 'licenses', licenses / 'Runtime-dependencies', dirs_exist_ok=True)
for package in ['frida','pyinstaller']:
    dist = importlib.metadata.distribution(package)
    for file in dist.files or []:
        if file.name.upper().startswith(('LICENSE','COPYING','NOTICE','AUTHORS')):
            src = Path(dist.locate_file(file))
            if src.is_file():
                dst = licenses / package / str(file)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src,dst)
source = bundle / 'source'
source.mkdir(exist_ok=True)
for name in ['gui.py','i18n.py','launcher.py','training-hook.js','phase3-controller.js','phase3-native.js','tian-summons.js','boss-extras.js','build_ui.ps1','package_ui.py','requirements.txt','requirements-build.txt','README.md','README.en.md','USAGE.en.txt','USAGE.zh-CN.txt','THIRD_PARTY_NOTICES.txt']:
    shutil.copy2(root / name, source / name)
shutil.copytree(root / 'tests',source / 'tests',dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('__pycache__'))
shutil.copytree(root / 'third_party',source / 'third_party',dirs_exist_ok=True)
archive = root / 'TFHMOD-UI-2.5.1-experimental-windows-x64.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for item in sorted(bundle.rglob('*')):
        if item.is_file():
            target.write(item,Path('TFHMOD-UI') / item.relative_to(bundle))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(root / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n',encoding='ascii')
print(archive, archive.stat().st_size,digest)
