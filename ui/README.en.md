# TFHMOD bilingual offline UI

[中文技术说明](README.md) · [English usage guide](USAGE.en.txt) · [中文使用说明](USAGE.zh-CN.txt)

Version: **2.4.2-ui-bilingual1**. Experimental Windows x64 tool for Them's Fightin' Herds.

## Download and run

Download the portable ZIP from [v2.4.2 experimental](https://github.com/Wayne62314/TFHMOD/releases/tag/v2.4.2-experimental), not GitHub's automatic Source code archive. Extract everything to a separate writable folder such as `D:\TFHMOD-UI-242`. Keep `_internal` beside `TFHMOD.exe`. **No installed Python or Setup.cmd required.**

Close older tools and completely restart the game. Start the game to its main menu, run the EXE, click **English**, select options, then **Connect to game**. Re-enter character select and load a new match. The language button is display-only and supports switching back to Chinese, including existing displayed logs. The Usage Guide button opens the selected-language guide.

## Features and controls

- P1 Arizona → Huggles; character-select artwork may remain Arizona.
- P1 Oleander → ordinary flag27 enhancement.
- Experimental phase-3 Oleander: manual flight, homing sparks, Fred and vortex. Not the story AI or a complete boss recreation.

| Key | Action |
| --- | --- |
| O / WASD | Toggle flight / bounded movement |
| P | Homing spark after startup |
| I | Queue one Fred summon; wait for his entrance |
| J / K | Left/right attacks |
| Shift / Ctrl + J/K | Strong / combination attacks; modifiers can be combined |
| L, then L again | Vortex charge, then request release |
| Y | Cancel, clean up Fred, restore control |
| U | Game pause; not read by this tool |

Only investigated offline free-training, local CPU and local two-player flows are allowed. P2 is not intentionally modified. Restart the game before online play. Do not bypass executable hash or native signature validation.

## Verification and known issues

The 2.4.1 repair addresses dropped I presses, startup frame-90 overwrite, vortex recovery, repeated-summon latch/timer and unbounded cleanup retries. Those fixes pass simulated regressions but still need in-game confirmation. The reported temporary opponent/Arizona appearance has not been reproduced or confirmed fixed. This release changes UI language/documentation, not gameplay behavior from 2.4.1.

Start testing in free training: O → I → Fred → J/K → L → L → recovery → P → Y → O → I. Repeat three times before testing rounds/rematches. Incomplete recovery requires a game restart.

## Source and build

`gui.py` serializes connection work on a worker thread; `i18n.py` handles presentation only. `training-hook.js` handles the investigated offline loads; `phase3-controller.js` holds deterministic gameplay control; `phase3-native.js` bridges guarded native operations and generation-scoped memory validation. No game assets, save files or executable are bundled.

From the repository root, using Python 3.12 on Windows:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ui\requirements-build.txt
node --test ui/tests/*.test.cjs
.\.venv\Scripts\python.exe -m unittest discover -s ui/tests -p "test_*.py"
.\.venv\Scripts\python.exe ui/gui.py --self-test
.\ui\build_ui.ps1 -PythonExe .\.venv\Scripts\python.exe
```

Build output is in `ui/dist/TFHMOD`; the portable ZIP and SHA256 list are created in `ui/`. Node is only used for development tests. Source users can install `requirements.txt` and run `gui.py`; portable users do not need these steps.

Logs are stored locally beside the EXE and are never uploaded automatically. Include version, mode, both characters and last keys in a report; inspect logs before sharing. Preserve [third-party notices](THIRD_PARTY_NOTICES.txt) and included licenses when redistributing.
