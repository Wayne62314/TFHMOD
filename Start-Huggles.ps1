param([string]$PythonPath)
$ErrorActionPreference = 'Stop'
try {
    if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell.' }
    $games = @(Get-Process -Name "Them's Fightin' Herds" -ErrorAction SilentlyContinue)
    if ($games.Count -ne 1) { throw 'Start exactly one game instance and wait for its main menu.' }
    $game = $games[0]
    $gamePath = $game.Path
    if (-not $gamePath -or [IO.Path]::GetFileName($gamePath) -ne "Them's Fightin' Herds.exe") {
        throw 'Unable to identify the game executable.'
    }
    $expectedHash = '03E20EECE23F39FB1012061A5A7FF92F4B63DA23EB8EB641CF6EE379CBCE373D'
    if ((Get-FileHash -LiteralPath $gamePath -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Unsupported game build. No hook installed. See README.md.'
    }
    if (-not $PythonPath) { $PythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe' }
    if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'Run Setup.cmd first, or specify -PythonPath.' }
    $moduleBase = '0x{0:x}' -f $game.MainModule.BaseAddress.ToInt64()
    & $PythonPath (Join-Path $PSScriptRoot 'runner.py') $game.Id $moduleBase
    if ($LASTEXITCODE -ne 0) { throw "Helper stopped with code $LASTEXITCODE." }
} catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}
