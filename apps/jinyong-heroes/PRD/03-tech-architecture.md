# 03 — 技术架构

派生自 `00` 第十、十一、十四节。冲突以 `00` 为准。

## 本仓实际目录

PRD 中的 `jy-web/` 多包结构在《连城诀》闭环通过后再拆。当前全部在 `apps/jinyong-heroes/`：

```text
src/core/       WorldState、dispatch、i16、ClassicRng、Save
src/event/      条件树与动作解释器
src/battle/     行动序、范围、伤害草稿、原典 AI 骨架
src/content/    schema 与连城诀最小数据（无原作素材）
src/game/       包入口，转发 core
facts/          原版事实、版本锁
bugs/COMPAT.md  Bug 兼容表
tests/          battle-golden / quest-paths / save-compat / anti-modern
```

禁止把 [`apps/korea-tactics/src/core`](../../korea-tactics/src/core) 的朝鲜战争规则搬进本项目。可借鉴其「纯函数 applyAction、种子可重放」的原则。

## dispatch 契约

```ts
gameCore.dispatch(state, action)
// => { state, presentation: { dialogue, audio, animation } }
```

渲染层只消费 `presentation`，不得改道德、背包或剧情 Flag。这样才能在 Node 中跑完整攻略、换画面不换逻辑、对比原版行为。

## 随机与整数

禁止 `Math.random()` 进入规则。使用 `ClassicRng`（LCG：`seed = imul(seed, 0x41c64e6d) + 0x3039`，取 `(seed >>> 16) & 0x7fff`）。实现 16 位有符号回绕、向零取整除法、战斗开始保存种子、种子+操作序列重放。

战斗公式在对照原版前标 `unverified-vs-original`。

## 导入器边界

`original-importer` 本阶段不实现。接口约定：引擎不内置原作字节；将来用户在浏览器选择自己拥有的原游戏文件后再转换加载。公开 R2 站点不得上传这些文件。

## Clean-room

可参考 HeroesOfJinYong 的**行为与公式文档**、jynew 的「数据驱动复刻可行」这一结论。禁止：

- 复制 HeroesOfJinYong 的 GPLv3 源码进本仓
- 复制 jynew 或原作美术、音乐、台词
- 把 Unity 工程编译成 WebGL 充当本项目

## 客户端

第一刀是文本/方格或本落地页说明。不接 Phaser/Pixi，直到连城诀路径测试全绿。React 若使用，只允许启动页、设置、存档壳。
