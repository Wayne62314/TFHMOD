param([string]$PythonPath)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $pythonArgs = @()
    if ($PythonPath) { $pythonExe = $PythonPath }
    elseif (Get-Command py -ErrorAction SilentlyContinue) { $pythonExe = 'py'; $pythonArgs = @('-3') }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $pythonExe = 'python' }
    else { throw 'Install 64-bit Python 3.11+ first. See README.md.' }
    & $pythonExe @pythonArgs -c "import sys,struct; assert sys.version_info >= (3,11), 'Python 3.11+ required'; assert struct.calcsize('P') == 8, '64-bit Python required'"
    if ($LASTEXITCODE -ne 0) { throw 'Python version/architecture check failed.' }
    $venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $venvPython)) {
        & $pythonExe @pythonArgs -m venv (Join-Path $PSScriptRoot '.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Could not create local Python environment.' }
    }
    & $venvPython -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    Write-Host 'Setup complete. Start the game, wait for the main menu, then run Start-Huggles.cmd.'
} finally { Pop-Location }
