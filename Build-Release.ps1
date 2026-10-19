$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $pythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Run Setup.cmd first.' }
    & $pythonExe -m pip install -r requirements-build.txt
    if ($LASTEXITCODE -ne 0) { throw 'Build dependency installation failed.' }
    $hookData = (Join-Path $PSScriptRoot 'training-hook.js') + ':.'
    & $pythonExe -m PyInstaller --noconfirm --clean --onedir --console --noupx --name TFHMOD --collect-all frida --add-data $hookData --distpath dist --workpath build --specpath build launcher.py
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
    & $pythonExe scripts/package_release.py
    if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
} finally { Pop-Location }
