# TFHMOD — 离线角色工具

[English](README.md) · [下载 UI 实验版](https://github.com/Wayne62314/TFHMOD/releases/tag/v2.5.1-experimental) · [完整中文使用说明](ui/USAGE.zh-CN.txt) · [MOD 开发文档](https://github.com/Wayne62314/TFH-Modding-Guide)

Windows x64 中英文界面，提供大熊、普通强化奥莉及包含 Fred/漩涡的三阶段实验功能。


## 2.5.1 新增实验

- Paprika：自由训练/本地人机/双人 P1 选 Paprika，F6 切换 Boss Flag27。具体效果还不明确，不宣称完整 Boss。
- Velvet：自由训练/本地人机/双人 P1 选 Velvet，F6 龙卷风，待机后 F7/F8/F9 冰柱。Y 仅停止调用，使用后必须重启；未移植剧情完整风推。
- 天火普通 Fred：P1 天火、P2 普通奥莉，F9 召唤、Y 清理，约 10 秒寿命和 1 秒冷却。仍有对手资源限制。
- 白鹤二气 Supernova 未成功，开关禁用，不包含二气演出或耗气。

Paprika/Velvet 独立实验已获用户反馈可用；整合 UI 版仍需实机回归。
新选项默认关闭，原有大熊/奥莉的离线模式范围不变。详细操作见 [中文指南](ui/USAGE.zh-CN.txt)。

## 下载和使用

1. 在 Release 的 Assets 下载 **TFHMOD-UI-2.5.1-experimental-windows-x64.zip**，不是自动生成的 Source code。
2. 完整解压到新的可写目录，例如 `D:\TFHMOD-UI-251`；**不必放进游戏目录**。保留 EXE 旁的 `_internal`，不要混用旧版文件。
3. 关闭旧工具，完全重启游戏到主菜单，再运行 `TFHMOD.exe`。运行库已包含，**无需安装 Python，无需 Setup.cmd**。
4. 右上角 **English** 切英文，**中文** 切回；状态与历史日志同步切换，不改变功能开关或重连。“使用说明”打开当前语言的指南。
5. 选择功能并连接后，返回选角重新进场。P1 选 Arizona 对应大熊；P1 选 Oleander 对应强化/三阶段。P2 不作主动修改。

三阶段按键：O 飞行/恢复，WASD 移动，P 追踪弹，I 排队一次 Fred 召唤，J/K 左右攻击（Shift 强化、Ctrl 组合，可叠加），L 漩涡/再次 L 请求爆发，**Y 清理恢复，U 留给游戏暂停**。

## 限制与测试状态

只用于已调查的普通自由训练、本地人机、本地双人。联网前关闭工具并完全重启游戏；离线白名单不是反作弊或联网兼容保证。不可跳过 EXE 哈希或原生签名校验。

大熊、普通强化和飞行性能优化此前已获用户实测。Fred、漩涡仍是实验功能；2.4.1 的发红/锁招/重复召唤修复通过模拟回归，仍需实际验证。对手短暂变小牛未复现，不宣称已经修复。不是剧情 BOSS 自动 AI 和完整演出的复刻。

2.5.1 新增上述有限实验功能，不代表完整剧情 Boss 移植。本工具不修改游戏资源和存档；不包含游戏文件。恢复未完全确认时请停止当前对局并重启。日志在 EXE 旁 logs，不会自动上传。

## 给 MOD 开发者

完整开发资料已整理到 **[TFH Modding Guide](https://github.com/Wayne62314/TFH-Modding-Guide)**，也提供可直接分享给外国作者的 **[完整英文版](https://github.com/Wayne62314/TFH-Modding-Guide/blob/main/README.en.md)**。14章涵盖引擎与 Lua 分工、资源加载、大熊与 Boss 实验、原生输入、预测隔离、录像与 AI、连段执行、测试和打包，并附来源、术语与安全示例。

这是特定构建的研究记录，不是官方 SDK；文档区分已验证、推测、失败和未知，不承诺完整 Boss 移植或联网支持。

跟着代码做可以看 **[动手教程](https://github.com/Wayne62314/TFH-Modding-Guide/blob/main/tutorials/README.md)**，从加一个教程关开始，继续做连战章节、读取人物和对局属性、隐藏 Boss 加载及观察钩子。[英文动手教程](https://github.com/Wayne62314/TFH-Modding-Guide/blob/main/tutorials/README.en.md) 内容对应。新示例的游戏内待测状态、原生输入片段缺少的适配器都单独标明。

当前源码、测试、构建说明见 [ui/](ui/README.en.md)，详细中文技术说明见 [ui/README.md](ui/README.md)。旧命令行工具说明保留在 [历史文档](docs/legacy-cli-README.md)，不要照旧说明运行 Setup/Start 来启动新版 UI。
