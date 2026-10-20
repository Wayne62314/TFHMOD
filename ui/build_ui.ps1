param([Parameter(Mandatory=$true)][string]$PythonExe)
$ErrorActionPreference = 'Stop'
$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
Push-Location $PSScriptRoot
try {
    $hookData = (Join-Path $PSScriptRoot 'training-hook.js') + ':.'
    $controllerData = (Join-Path $PSScriptRoot 'phase3-controller.js') + ':.'
    $nativeData = (Join-Path $PSScriptRoot 'phase3-native.js') + ':.'
    & $PythonExe -m PyInstaller --noconfirm --clean --onedir --windowed --noupx --name TFHMOD --collect-all frida --add-data $hookData --add-data $controllerData --add-data $nativeData --distpath dist --workpath build --specpath build gui.py
    if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
    & $PythonExe package_ui.py
    if ($LASTEXITCODE -ne 0) { throw 'UI packaging failed' }
} finally { Pop-Location }
