"""Standalone Windows entry point; no installed Python needed in a frozen build."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

VERSION = '2.1.0'
GAME_HASH = '03E20EECE23F39FB1012061A5A7FF92F4B63DA23EB8EB641CF6EE379CBCE373D'


def find_game():
    # Read-only process discovery. No scripts, execution-policy changes or profile loading.
    query = """$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;
    $games=@(Get-Process -Name "Them's Fightin' Herds" -ErrorAction SilentlyContinue);
    if($games.Count -ne 1){throw 'Start exactly one game instance and wait for its main menu.'};
    $g=$games[0];
    @{pid=$g.Id;path=$g.Path;base=('0x{0:x}' -f $g.MainModule.BaseAddress.ToInt64())}|ConvertTo-Json -Compress
    """
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', query],
                            capture_output=True, encoding='utf-8', errors='replace',
                            timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('请先从 Steam 启动一个游戏实例，等到主菜单再运行工具。若已启动，请确认游戏与工具的权限一致。')
    game = json.loads(result.stdout)
    path = Path(game['path'])
    if path.name != "Them's Fightin' Herds.exe":
        raise RuntimeError('无法确认游戏可执行文件，未安装钩子。')
    with path.open('rb') as handle:
        actual = hashlib.file_digest(handle, 'sha256').hexdigest().upper()
    if actual != GAME_HASH:
        raise RuntimeError('游戏版本不匹配，未安装钩子。不要跳过校验；请查看使用说明中的支持版本。')
    return game


def main():
    parser = argparse.ArgumentParser(description='TFHMOD Huggles 离线分享版')
    parser.add_argument('--self-test', action='store_true', help='检查打包依赖，不连接游戏')
    args = parser.parse_args()
    if args.self_test:
        import frida
        import runner
        root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
        source = (root / 'training-hook.js').read_text(encoding='utf-8')
        assert "version:'2.1.0'" in source
        assert frida.__version__ == '17.24.3'
        assert hasattr(frida, 'attach') and callable(runner.main)
        print(f'PASS TFHMOD {VERSION}; Python {sys.version.split()[0]}; Frida {frida.__version__}; bundled hook present')
        return 0
    print(f'TFHMOD {VERSION} · Huggles 大熊离线工具', flush=True)
    print('仅用于本地自由训练、双人和人机对战。不要用于在线模式。', flush=True)
    code = 1
    try:
        game = find_game()
        import runner
        code = runner.main([str(game['pid']), game['base']])
    except KeyboardInterrupt:
        code = 0
    except Exception as error:
        print(f'启动失败：{error}', flush=True)
    finally:
        try:
            input('工具已停止。请重启游戏以完全清除本次内存改动。按回车关闭。')
        except (EOFError, KeyboardInterrupt):
            pass
    return code


if __name__ == '__main__':
    raise SystemExit(main())
