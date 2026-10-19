"""Collect notices, make the portable ZIP, and write its checksum."""
import hashlib
import importlib.metadata
from pathlib import Path
import shutil
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
bundle = root / 'dist' / 'TFHMOD'
if not (bundle / 'TFHMOD.exe').is_file():
    raise SystemExit('Build TFHMOD.exe first')
for name in ['README.md', '使用说明.txt', 'THIRD_PARTY_NOTICES.txt']:
    shutil.copy2(root / name, bundle / name)
licenses = bundle / 'licenses'
licenses.mkdir(exist_ok=True)
shutil.copy2(Path(sys.base_prefix) / 'LICENSE.txt', licenses / 'Python-LICENSE.txt')
shutil.copytree(root / 'third_party' / 'licenses', licenses / 'Runtime-dependencies', dirs_exist_ok=True)
for package, label in [('frida', 'Frida'), ('pyinstaller', 'PyInstaller')]:
    dist = importlib.metadata.distribution(package)
    count = 0
    for file in dist.files or []:
        if file.name.upper().startswith(('LICENSE', 'COPYING', 'NOTICE', 'AUTHORS')):
            source = Path(dist.locate_file(file))
            if source.is_file():
                destination = licenses / label / Path(str(file))
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                count += 1
                if file.name.upper().startswith('COPYING'):
                    shutil.copy2(source, licenses / (label + ('-COPYING' if label == 'Frida' else '-COPYING.txt')))
    if not count:
        raise SystemExit(f'Missing {package} license notices')
release = root / 'release'
release.mkdir(exist_ok=True)
archive = release / 'TFHMOD-v2.1.0-windows-x64.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for source in sorted(bundle.rglob('*')):
        if source.is_file():
            target.write(source, Path('TFHMOD') / source.relative_to(bundle))
with archive.open('rb') as handle:
    digest = hashlib.file_digest(handle, 'sha256').hexdigest()
(release / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='ascii')
print(f'{archive.name}: {archive.stat().st_size:,} bytes; SHA256 {digest}')
