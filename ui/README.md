# TFHMOD UI 2.5.0 实验版

[English](README.en.md) · [中文使用说明](USAGE.zh-CN.txt) · [English guide](USAGE.en.txt)

新增 Paprika / Velvet 训练实验开关，保留大熊、普通强化奥莉、三阶段奥莉和天火普通 Fred。
[下载实验版](https://github.com/Wayne62314/TFHMOD/releases/tag/v2.5.0-experimental)。
完整解压到游戏目录外的新文件夹，保留 EXE 旁 _internal，无需 Python 或 Setup.cmd。

## 功能边界

- Paprika：自由训练 P1 选 Paprika，站稳后 F6 切换剧情 Boss Flag27。独立实验已获用户反馈可用，但实际强化效果尚未明确；不宣称完整 Boss，不接入前景攻击。
- Velvet：自由训练 P1 选 Velvet，F6 龙卷风，待机后 F7/F8/F9 三档冰柱。独立实验用户反馈可用，整合 UI 仍需实机回归。Y 只停止调用，龙卷风尚无可靠清理，必须重启游戏。
- 天火普通 Fred：P1 天火、P2 必须普通奥莉；F9 召唤，Y 清理，约 10 秒寿命、1 秒冷却。不能任意选择对手，UI 重复召唤仍属实验。
- Supernova 尚未成功，选项保持禁用，不包含法球、二气演出或耗气。

原有大熊/奥莉仅支持已调查的离线模式；新增 Paprika/Velvet 收窄为普通自由训练，未开放本地对战或 CPU。

## 代码与验证

核心新增文件 boss-extras.js：模式/角色/资源校验、按键边沿、原生状态调用与角色代际保护。
tian-summons.js 借用场景已加载的奥莉资源创建普通 Fred。不是向游戏 Lua 插入新脚本，不修改硬盘游戏文件。

构建和测试命令见 [英文技术说明](README.en.md)。独立输出在 ui/dist-250/TFHMOD，不覆盖旧版目录。
单元测试、打包自检不替代实际游戏测试。断开未确认恢复时请重启游戏；任何联机前均须关闭工具并重启。
