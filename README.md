# TFHMOD — Offline Character Tool

[中文说明](README.zh-CN.md) · [Download experimental UI](https://github.com/Wayne62314/TFHMOD/releases/tag/v2.5.1-experimental) · [English usage guide](ui/USAGE.en.txt)

An unofficial **Chinese / English Windows x64 UI** for offline Them's Fightin' Herds experiments: Huggles, enhanced Oleander, and experimental manual phase-3 Oleander with Fred and vortex.


## New in 2.5.1 experimental

| Experiment | Selection and keys | Limits |
| --- | --- | --- |
| Paprika Boss flag | P1 Paprika, F6 while idle | Free training / local CPU / local versus, P1 only; actual Flag27 effects remain unclear, NOT a full Boss unlock |
| Velvet tornado | P1 Velvet, F6; then F7/F8/F9 icicles from tornado idle | Free training / local CPU / local versus, P1 only; story wind push not ported; Y stops calls, restart REQUIRED |
| Tianhuo normal Fred | P1 Tianhuo, P2 ordinary Oleander; F9 summon, Y cleanup | P2 resource prerequisite; ~10s lifetime, ~1s cooldown; experimental UI integration |
| Baihe Supernova | Disabled | Not successfully ported; no orbs, performance or meter cost |

Paprika/Velvet standalone experiments were user-tested. Integrated UI regression is still needed.
Existing Huggles/Oleander offline scopes are unchanged. New options default OFF.
See the [full guide](ui/USAGE.en.txt). Restart after Velvet's tornado, even after Y/disconnect.

## Quick start

1. Download **TFHMOD-UI-2.5.1-experimental-windows-x64.zip** from the release's Assets. GitHub's automatic Source code archives are not the portable app.
2. Extract the **entire ZIP** to a separate writable folder, for example `D:\TFHMOD-UI-251`. It does **not** need to be in the game folder. Keep `_internal` beside `TFHMOD.exe`.
3. Close older tools and **fully restart the game**. Start it from Steam to the main menu, then run `TFHMOD.exe`. Python/Frida/Tcl/Tk are bundled; **no Python installation or Setup.cmd required**.
4. Click **English** in the upper-right corner. Use **中文** to switch back. Click **Usage Guide** for instructions in the selected language.
5. Choose options, connect, then return to character select and enter a new match. Choose **Arizona for Huggles** or **Oleander for enhancement / phase 3**. P1 only.

## Controls

| Key | Phase-3 action |
| --- | --- |
| O / WASD | Enter or leave flight / move |
| P | Homing spark after startup |
| I | Queue one Fred summon; wait for his entrance |
| J / K | Fred left/right attacks; Shift strengthens, Ctrl selects combination attacks |
| L, then L | Vortex charge, then request release |
| Y | Cancel and restore control; clean up Fred |
| U | Game pause; this tool does not read U |

## Safety and experimental status

**Offline only:** investigated ordinary free-training, local CPU and local two-player flows. Not all offline modes or stages are supported. Close the tool and restart the game before online play; the whitelist is not an anti-cheat or network-safety guarantee.

Gameplay changes use process memory; no game resources or saves are modified on disk. The supported game executable SHA256 is:

```text
03E20EECE23F39FB1012061A5A7FF92F4B63DA23EB8EB641CF6EE379CBCE373D
```

Do not bypass version/signature checks. The unsigned EXE may be flagged; do not disable security software to run it.

Huggles, enhancement and the flight performance optimization were previously tested by the author/user. Fred/vortex features remain experimental. The 2.4.1 repair passes simulated regressions but still needs in-game verification of red/stuck-state recovery and repeated summoning. The reported temporary opponent/Arizona appearance was not reproduced or confirmed fixed. **This is not the full scripted story boss.** Version 2.5.1 adds the limited experiments listed above; it does not claim full story-boss ports.

If recovery is incomplete, stop and restart the game. Logs remain local under `logs` beside the EXE; they are not automatically uploaded. Inspect them before sharing.

## Source, build and older versions

Current UI source, tests and build scripts are in **[ui/](ui/README.en.md)**. Portable releases also include source and runtime license notices. See [third-party notices](ui/THIRD_PARTY_NOTICES.txt).

The old root-level command-line tool remains available for reference; its documentation is [archived here](docs/legacy-cli-README.md). Use the current UI release instructions above, not the legacy Setup/Start scripts. Older releases are retained on the [release listing](https://github.com/Wayne62314/TFHMOD/releases).
