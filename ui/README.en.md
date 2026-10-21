# TFHMOD UI 2.5.0 experimental

[中文](README.md) · [English guide](USAGE.en.txt) · [中文指南](USAGE.zh-CN.txt)

Portable bilingual Windows x64 UI. [Download v2.5.0 experimental](https://github.com/Wayne62314/TFHMOD/releases/tag/v2.5.0-experimental).
Extract the entire ZIP outside the game folder; keep _internal beside TFHMOD.exe. No Python installation or Setup.cmd needed.

## New experiments

- Paprika: free-training P1 Paprika, F6 toggles the story's Flag27. Standalone test user-confirmed; actual effects unclear. No foreground attack mappings or full Boss claim.
- Velvet: free-training P1 Velvet, F6 tornado, then F7/F8/F9 icicles from Boss_Wind_Idle. Standalone test user-confirmed; UI integration still needs gameplay regression. Y stops calls, NOT reliable tornado cleanup. Restart after use.
- Tianhuo normal Fred: F9 summons, Y cleanup; P2 ordinary Oleander REQUIRED. 600-update lifetime, 60-update cooldown. UI repeated summoning remains experimental.
- Supernova remains unavailable/disabled. No level-two effects or meter cost.

Existing Huggles and Oleander options remain. Only investigated offline flows are allowed; Paprika/Velvet are narrowed to ordinary free training. Read the full guide before use.

## Architecture and build

gui.py serializes connection work on a worker. i18n.py is display-only. training-hook.js guards offline loads; phase3-controller.js and phase3-native.js handle Oleander; tian-summons.js controls normal Fred; boss-extras.js ports the tested Paprika/Velvet manual input experiment with generation guards.
No game assets, executables, saves or Lua files are modified/distributed.

From the repository root (Windows, Python 3.12):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ui\requirements-build.txt
node --test ui/tests/*.test.cjs
.\.venv\Scripts\python.exe -m unittest discover -s ui/tests -p "test_*.py"
.\.venv\Scripts\python.exe ui/gui.py --self-test
.\ui\build_ui.ps1 -PythonExe .\.venv\Scripts\python.exe
```

Output: ui/dist-250/TFHMOD, ui/TFHMOD-UI-2.5.0-experimental-windows-x64.zip, ui/SHA256SUMS.txt.
Source and licenses are included in the ZIP. See [third-party notices](THIRD_PARTY_NOTICES.txt).
Tests do not replace gameplay verification. Local logs are never automatically uploaded.
