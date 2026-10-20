"""Small Windows UI; Frida work is serialized on a worker, never the UI thread."""
import json
import msvcrt
import os
from pathlib import Path
import queue
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import ttk
from datetime import datetime

from launcher import find_game
from i18n import translate

VERSION = '2.4.2-ui-bilingual1'


class Backend:
    def __init__(self, events, finder=find_game, attach=None):
        self.events, self.finder, self.attach = events, finder, attach
        self.commands = queue.Queue()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self):
        self.thread.start()

    def emit(self, kind, value):
        self.events.put((kind, value))

    def run(self):
        session = script = lock = log = None
        restored = threading.Event()
        generation = 0

        def cleanup():
            nonlocal session, script, lock, log, generation
            generation += 1
            if script is not None:
                try:
                    restored.clear()
                    # Queue native cleanup on the game thread, never invoke movement from RPC.
                    pending = script.exports_sync.shutdown().get('pending', False)
                    if pending and not restored.wait(2):
                        self.emit('log', '未确认飞行清理；请重启游戏，勿继续当前战斗或进入联机。')
                except Exception:
                    pass
            old, session, script = session, None, None
            if old is not None:
                try:
                    old.detach()
                except Exception:
                    pass
            if lock is not None:
                lock.close()
                lock = None
            if log is not None:
                log.close()
                log = None

        try:
            while True:
                command, value = self.commands.get()
                try:
                    if command in ('disconnect', 'quit'):
                        cleanup()
                        self.emit('disconnected', '已断开。当前战斗的修改需重启游戏才能完全恢复。')
                        if command == 'quit':
                            return
                    elif command == 'detached':
                        if value != generation:
                            continue
                        cleanup()
                        self.emit('disconnected', '游戏已退出或连接中断。')
                    elif command == 'configure':
                        if script is None:
                            self.emit('log', '选项已更新，将在下次连接时应用。')
                        else:
                            actual = script.exports_sync.configure(value)
                            self.emit('configured', actual)
                    elif command == 'connect':
                        if session is not None:
                            continue
                        self.emit('connecting', '正在查找游戏并校验版本…')
                        game = self.finder()
                        lock_path = Path(tempfile.gettempdir()) / f"tfhmod-huggles-{game['pid']}.lock"
                        lock = lock_path.open('a+b')
                        if os.fstat(lock.fileno()).st_size == 0:
                            lock.write(b'0')
                            lock.flush()
                        lock.seek(0)
                        try:
                            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                        except OSError:
                            raise RuntimeError('另一个 TFHMOD 工具正在使用该游戏，请先关闭旧工具。')
                        root = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
                        resources = Path(getattr(sys, '_MEIPASS', root))
                        logs = root / 'logs'
                        logs.mkdir(exist_ok=True)
                        log = (logs / f"ui-hook-{game['pid']}.jsonl").open('a', encoding='utf-8')
                        if self.attach is None:
                            import frida
                            attach = frida.attach
                        else:
                            attach = self.attach
                        session = attach(game['pid'])
                        token = generation
                        session.on('detached', lambda *args, token=token: self.commands.put(('detached', token)))
                        source = '\n'.join((resources/name).read_text(encoding='utf-8') for name in
                            ['phase3-controller.js','phase3-native.js','training-hook.js'])
                        # Configure before load: no interval with unintended default options.
                        source = source.replace('let options = {bear:true, boss:false, phase3:false};',
                                                'let options = '+json.dumps(value)+';')
                        script = session.create_script(source.replace('__BASE__', game['base']))
                        ready, errors = threading.Event(), []

                        def message(msg, data, token=token, handle=log):
                            if token != generation:
                                if msg.get('payload',{}).get('event') == 'phase3_restored' and msg.get('payload',{}).get('complete', True):
                                    restored.set()
                                return
                            try:
                                handle.write(json.dumps(msg, ensure_ascii=False)+'\n')
                                handle.flush()
                            except (OSError, ValueError):
                                pass
                            payload = msg.get('payload', {})
                            if msg.get('type') == 'error':
                                errors.append(msg.get('description', 'Hook error'))
                                ready.set()
                                self.emit('log', '钩子错误：'+str(errors[-1]))
                                self.commands.put(('detached', token))
                            elif payload.get('event') == 'ready':
                                ready.set()
                            else:
                                self.emit('event', payload)

                        script.on('message', message)
                        script.load()
                        if not ready.wait(5) or errors:
                            raise RuntimeError(errors[0] if errors else '钩子未就绪，已停止连接。')
                        actual = script.exports_sync.configure(value)
                        self.emit('connected', {'pid':game['pid'], **actual})
                except Exception as error:
                    cleanup()
                    self.emit('disconnected', '操作失败：'+str(error))
        finally:
            cleanup()
            self.emit('stopped', '')


class App:
    def __init__(self, root, backend=None):
        self.root = root
        self.events = queue.Queue()
        self.backend = backend or Backend(self.events)
        self.connected = False
        self.busy = False
        self.closing = False
        self.language = 'zh'
        self.history = []
        root.title('TFHMOD · 离线角色工具')
        root.geometry('780x720')
        root.minsize(620, 550)
        style = ttk.Style(root)
        if 'vista' in style.theme_names():
            style.theme_use('vista')
        style.configure('Title.TLabel', font=('Microsoft YaHei UI', 17, 'bold'))
        frame = ttk.Frame(root, padding=22)
        frame.pack(fill='both', expand=True)
        titlebar = ttk.Frame(frame)
        titlebar.pack(fill='x')
        ttk.Label(titlebar, text='TFHMOD 离线角色工具', style='Title.TLabel').pack(side='left')
        self.language_button = ttk.Button(titlebar, text='English', command=self.toggle_language)
        self.language_button.pack(side='right')
        ttk.Label(frame, text=VERSION+'  ·  仅限本地训练 / 人机 / 双人对战').pack(anchor='w', pady=(4,16))
        box = ttk.LabelFrame(frame, text='玩家 1 的角色修改', padding=14)
        box.pack(fill='x')
        self.bear = tk.BooleanVar(root, True)
        self.boss = tk.BooleanVar(root, False)
        self.phase3 = tk.BooleanVar(root, False)
        ttk.Checkbutton(box, text='启用大熊：选择 Arizona → Huggles', variable=self.bear,
                        command=self.configure).pack(anchor='w', pady=5)
        ttk.Checkbutton(box, text='普通强化奥莉：选择 Oleander → flag27 强化', variable=self.boss,
                        command=self.configure).pack(anchor='w', pady=5)
        ttk.Checkbutton(box, text='三阶段奥莉：飞行＋追踪弹＋弗雷德＋漩涡（实验）', variable=self.phase3,
                        command=self.configure).pack(anchor='w', pady=5)
        ttk.Label(frame, text='三阶段包含 flag27；普通强化可单独保留。仅修改玩家 1。').pack(anchor='w', pady=(10,4))
        ttk.Label(frame, text='重新选角进场后生效。O 飞行，WASD 移动，P 追踪弹，Y 恢复。U 留给暂停。\nI 召唤弗雷德；J/K 左右攻击，Shift 强化、Ctrl 组合；L 漩涡，再按 L 释放。\n追加预留碰撞位，不更换地图。先按 Y 再断开；联机前必须重启游戏。',
                  wraplength=610).pack(anchor='w')
        controls = ttk.Frame(frame)
        controls.pack(fill='x', pady=(16,8))
        self.connect_button = ttk.Button(controls, text='连接游戏', command=self.connect)
        self.connect_button.pack(side='left')
        self.disconnect_button = ttk.Button(controls, text='断开连接', command=self.disconnect, state='disabled')
        self.disconnect_button.pack(side='left', padx=8)
        ttk.Button(controls, text='使用说明', command=self.open_help).pack(side='left')
        self.status = tk.StringVar(root, '未连接 · 先启动游戏到主菜单，再点“连接游戏”')
        self._status_raw = self.status.get()
        ttk.Label(frame, textvariable=self.status, wraplength=560).pack(anchor='w', pady=(0,8))
        logframe = ttk.Frame(frame)
        logframe.pack(fill='both', expand=True)
        self.log = tk.Text(logframe, height=6, state='disabled', wrap='word', font=('Microsoft YaHei UI',9))
        scrollbar = ttk.Scrollbar(logframe, command=self.log.yview)
        self.log.configure(yscrollcommand=scrollbar.set)
        self.log.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
        root.protocol('WM_DELETE_WINDOW', self.close)
        self._localized_widgets = []
        def remember(widget):
            if widget is not self.language_button:
                try:
                    value = widget.cget('text')
                    if value:
                        self._localized_widgets.append((widget, str(value)))
                except tk.TclError:
                    pass
            for child in widget.winfo_children():
                remember(child)
        remember(root)
        self.backend.start()
        root.after(100, self.poll)

    def options(self):
        return {'bear':self.bear.get(), 'boss':self.boss.get(), 'phase3':self.phase3.get()}

    def append(self, text):
        self.history.append((datetime.now().strftime('%H:%M:%S'), text))
        self.history = self.history[-400:]
        self.render_history()

    def render_history(self):
        self.log.configure(state='normal')
        self.log.delete('1.0', 'end')
        for stamp, text in self.history:
            self.log.insert('end', stamp+'  '+translate(text, self.language)+'\n')
        self.log.see('end')
        self.log.configure(state='disabled')

    def set_status(self, text):
        self._status_raw = text
        self.status.set(translate(text, self.language))

    def set_language(self, language):
        if language not in ('zh', 'en'):
            raise ValueError('Unsupported UI language')
        self.language = language
        self.root.title(translate('TFHMOD · 离线角色工具', language))
        for widget, original in self._localized_widgets:
            widget.configure(text=translate(original, language))
        self.language_button.configure(text='中文' if language == 'en' else 'English')
        self.status.set(translate(self._status_raw, language))
        self.render_history()

    def toggle_language(self):
        self.set_language('en' if self.language == 'zh' else 'zh')

    def open_help(self):
        root = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
        path = root / ('USAGE.en.txt' if self.language == 'en' else 'USAGE.zh-CN.txt')
        try:
            os.startfile(path)
        except OSError as error:
            self.append('操作失败：'+str(error))

    def configure(self):
        self.backend.commands.put(('configure', self.options()))

    def connect(self):
        if self.busy or self.connected:
            return
        self.busy = True
        self.connect_button.configure(state='disabled')
        self.backend.commands.put(('connect', self.options()))

    def disconnect(self):
        self.disconnect_button.configure(state='disabled')
        self.backend.commands.put(('disconnect', None))

    def close(self):
        if not self.closing:
            self.closing = True
            self.set_status('正在断开连接并退出…')
            self.connect_button.configure(state='disabled')
            self.disconnect_button.configure(state='disabled')
            self.backend.commands.put(('quit', None))

    def poll(self):
        while not self.events.empty():
            kind, value = self.events.get_nowait()
            if kind == 'stopped':
                self.root.destroy()
                return
            if kind == 'connecting':
                self.set_status(value)
            elif kind == 'connected':
                self.connected, self.busy = True, False
                self.disconnect_button.configure(state='normal' if not self.closing else 'disabled')
                self.set_status(f"已连接游戏 · PID {value['pid']} · 等待重新选角进场")
                self.append('连接成功。'+self.describe(value))
            elif kind == 'configured':
                self.append('开关已应用（影响后续加载）。'+self.describe(value))
            elif kind == 'disconnected':
                self.connected, self.busy = False, False
                self.connect_button.configure(state='normal' if not self.closing else 'disabled')
                self.disconnect_button.configure(state='disabled')
                self.set_status(value)
                self.append(value)
            elif kind == 'log':
                self.append(value)
            elif kind == 'event':
                event = value.get('event')
                if event == 'replaced':
                    self.append('玩家 1：Arizona 已替换为大熊。')
                elif event == 'boss_applied':
                    self.append('玩家 1：奥莉 flag27 已开启，回读成功。')
                elif event == 'phase3_armed':
                    self.append('三阶段已准备：O 飞行，P 追踪弹，I 弗雷德，J/K 攻击，L 漩涡，Y 恢复。U 暂停。')
                elif event == 'phase3_flight':
                    self.append('已请求飞行；约 1.5 秒后可使用 P。')
                elif event == 'phase3_spark':
                    self.append('已请求追踪弹。')
                elif event == 'phase3_fred_prepared':
                    self.append('弗雷德预留碰撞位已追加，原场地保留。')
                elif event == 'phase3_fred_summon':
                    self.append('已请求召唤弗雷德，等待出场完成。')
                elif event == 'phase3_summon_queued':
                    self.append('召唤请求已记住：启动、冷却或当前动作结束后执行一次。Y 可取消。')
                elif event == 'phase3_fred_ready':
                    self.append('弗雷德已准备：J/K 攻击，Shift 强化、Ctrl 组合；L 漩涡。')
                elif event == 'phase3_fred_attack':
                    self.append('弗雷德：'+str(value.get('state')))
                elif event == 'phase3_vortex':
                    self.append('已请求漩涡；蓄力后可再按 L 释放，Y 恢复。')
                elif event == 'phase3_vortex_release':
                    self.append('已请求释放漩涡。')
                elif event == 'phase3_vortex_finished':
                    self.append('漩涡已收尾，临时标志恢复，可继续使用招式。')
                elif event == 'phase3_cleanup_warning':
                    self.append('恢复未完全确认，请重启游戏：'+str(value.get('message',value.get('errors'))))
                elif event == 'phase3_fred_cleaned':
                    self.append('弗雷德清理已执行；预留碰撞位保留供本场复用。')
                elif event == 'phase3_notice':
                    self.append('三阶段提示：'+str(value.get('message')))
                elif event == 'phase3_restored':
                    self.append('飞行已退出，恢复玩家控制。' if value.get('complete',True) else '飞行已停止，但恢复未完全确认；请重启游戏。')
                elif event == 'phase3_error':
                    self.append('三阶段错误：'+str(value.get('message'))+'；请重启游戏后反馈日志。')
                elif event == 'error':
                    self.append('跳过修改：'+str(value.get('message')))
        self.root.after(100, self.poll)

    @staticmethod
    def describe(value):
        return '大熊：'+('开' if value['bear'] else '关')+' / 普通奥莉：'+('开' if value['boss'] else '关')+' / 三阶段：'+('开' if value.get('phase3') else '关')


def main():
    if '--self-test' in sys.argv:
        import frida
        assert frida.__version__ == '17.24.3'
        resources = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
        assert 'rpc.exports' in (resources / 'training-hook.js').read_text(encoding='utf-8')
        assert 'createPhase3Controller' in (resources / 'phase3-controller.js').read_text(encoding='utf-8')
        assert 'createNativePhase3' in (resources / 'phase3-native.js').read_text(encoding='utf-8')
        root = tk.Tk()
        root.withdraw()
        app = App(root)
        assert app.options() == {'bear':True, 'boss':False, 'phase3':False}
        app.boss.set(True)
        app.phase3.set(True)
        assert app.options() == {'bear':True,'boss':True,'phase3':True}
        app.configure()
        root.update()
        before = app.options()
        app.append('已请求追踪弹。')
        app.toggle_language()
        assert app.options() == before
        assert app.language == 'en' and app.connect_button.cget('text') == 'Connect to game'
        assert 'Homing spark requested.' in app.log.get('1.0', 'end')
        app.toggle_language()
        assert app.language == 'zh' and app.connect_button.cget('text') == '连接游戏'
        app.close()
        root.mainloop()
        return 0
    root = tk.Tk()
    App(root)
    root.mainloop()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
