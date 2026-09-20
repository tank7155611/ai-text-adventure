<p align="center">
  <img src="./docs/images/readme-banner.svg" width="960" alt="AI Text Adventure — six worlds, 100 rounds, every choice matters">
</p>

<h1 align="center">AI 文字冒险</h1>

<p align="center"><strong>踏入另一个世界，让每一次选择写下你的故事。</strong></p>
<p align="center">六大世界 · 100 轮冒险 · 每轮三选一 · AI 叙事 × 规则结算</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-d4ad67?style=flat-square" alt="License: MIT"></a>
  <a href="https://github.com/tank7155611/ai-text-adventure/actions/workflows/ci.yml"><img src="https://github.com/tank7155611/ai-text-adventure/actions/workflows/ci.yml/badge.svg" alt="Tests and build"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/Node.js-24%2B-43853d?style=flat-square" alt="Node.js 24+"></a>
  <a href="https://github.com/tank7155611/ai-text-adventure/stargazers"><img src="https://img.shields.io/github/stars/tank7155611/ai-text-adventure?style=flat-square&amp;color=d4ad67" alt="GitHub stars"></a>
</p>

<p align="center"><strong>简体中文</strong> | <a href="./README.en.md">English</a></p>
<p align="center"><a href="#quick-start">开始冒险</a> · <a href="#preview">界面预览</a> · <a href="#design">设计原理</a> · <a href="https://github.com/tank7155611/ai-text-adventure/issues">反馈建议</a></p>

> 本项目为本地运行的 Demo，需自行配置 OpenAI 兼容接口与 API Key；模型调用可能产生费用。

---

<a id="preview"></a>

## 先看一眼你的冒险

![早期 Demo 的世界选择界面](./docs/images/world-selection.png)

<sub>截图来自早期 Demo，当前版本的界面细节可能有所不同。</sub>

## 为什么值得一玩

| | 你会体验到什么 |
| --- | --- |
| 🌌 六个不同世界 | 魔法、末日、科幻、玄幻、蒸汽朋克、海底文明，选择你的故事起点。 |
| 🧭 有代价的选择 | 每轮三选一，生命、理智、攻击、防御与主线进度随行动改变。 |
| 📖 AI 负责讲述 | 模型描绘剧情、编写选项，规则层负责计算真实结果。 |
| 🕯️ 延续的故事线 | 章节记录与主线状态保留本局的重要选择和未回收伏笔。 |
| ⚖️ 多种冒险结局 | 争取标准或完美完成，也可能迎来苦涩结局、失控或死亡。 |

<a id="quick-start"></a>

## 本地启动

需要 Node.js 24 或更高版本。模型服务由使用者自行配置，调用可能产生费用。

### 1. 安装依赖

```bash
npm ci
```

### 2. 配置环境变量

将根目录的 `.env.example` 复制为 `.env.local`，填写自己的接口、模型和密钥：

```env
VITE_OPENAI_COMPAT_BASE_URL=https://api.example.com/v1
VITE_OPENAI_COMPAT_MODEL=your_model_name
OPENAI_COMPAT_API_KEY=your_api_key_here
```

说明：

- `VITE_OPENAI_COMPAT_BASE_URL`：OpenAI 兼容接口地址。
- `VITE_OPENAI_COMPAT_MODEL`：模型名称。
- `OPENAI_COMPAT_API_KEY`：接口密钥，由 Vite 本地代理注入请求头。

不要提交 `.env.local`，也不要把真实 API Key 写进代码。

### 3. 启动开发服务

```bash
npm run dev
```

打开终端显示的本地地址，例如：

```text
http://127.0.0.1:5173/
```

### 4. 构建

```bash
npm run build
```

### 5. 运行测试

运行完整测试：

```bash
npm test
```

开发时监听文件变化：

```bash
npm run test:watch
```

### 6. 预览构建结果

```bash
npm run preview
```

### 7. 平衡模拟

使用实际规则层运行六个世界、四种策略、50个种子、两档恢复阈值的确定性模拟，并逐局核对中英文数值轨迹：

```bash
npm run simulate:balance
```

脚本运行4800局（含2400局中文对照），输出每种策略的平均结束轮次、HP、SAN、主线进度、结局分布、无治疗连续轮数、治疗浪费和死亡时是否存在生存选项。详细结果写入 `output/balance-review-results.json`。模拟读取隐藏计划，不代表真实玩家胜率；没有模型生成的线索，因此不衡量完美结局。保守与均衡策略不使用可变恢复阈值，两档结果相同。

更详细的本地启动说明见 [启动说明.md](./启动说明.md)。

## 注意事项

这是本地 Demo，不建议直接把当前形态部署到公网。

当前密钥由本机 Vite 代理读取并添加到发往模型服务的请求头，前端代码不读取密钥。`VITE_` 前缀的变量会公开到前端，因此密钥必须使用 `OPENAI_COMPAT_API_KEY`，不能添加 `VITE_` 前缀。

发布仓库不会自动提供在线模型服务；GitHub Pages 等纯静态托管无法运行本项目的本地代理。正式上线时应该改为：

```text
前端页面
↓
自己的后端接口
↓
OpenAI 兼容模型服务
```

当前项目里的 Vite proxy 只适合本地开发和演示。请保持仅监听本机，不要通过公网隧道或开放端口共享带有个人密钥的开发服务器。公网后端还需要访问控制和调用额度限制。

<a id="design"></a>

## 冒险背后的设计

AI 编写叙事，前端规则层控制数值结果。想了解实现方式，可以展开下面的说明。

<details>
<summary>游戏机制与稳定性</summary>

## 特点

- 六个可选世界：魔法世界、末日生存、科幻未来、东方玄幻、蒸汽朋克、海底文明。
- 100 轮冒险结构，每轮提供 A/B/C 三个行动选项。
- 剧情文本由模型完整返回后，页面以流式播放样式逐步展示，玩家不需要面对空白等待。
- 开场和普通轮次统一按约每秒 20 个字播放正文，并以 100ms 节奏校准，避免整秒跳字造成卡顿感。
- 前端预设 `ChoicePlan`，控制每个选项的隐藏数值后果和主线推进；剧情提示、下一轮计划、正式结算共用同一份结算预览。
- 普通轮次在剧情播放期间提前准备下一轮计划，但在控制 JSON 完成前不展示默认选项；控制 JSON 完成后才显示并解锁最终文案。
- 生命经济采用独立恢复权重：包扎、急救、彻底休整会随机出现在准备位，不依赖当前 HP；普通、风险和重大行动的生命代价分层提高，并设置单次扣血上限。
- 选项控制请求与 JSON 自动修复请求分别设置 45 秒超时；超时会保留当前剧情并提供“重新生成选项”，不会无限停在等待状态。
- 两段式 LLM 生成：先生成剧情文本，再生成短控制 JSON。
- Zod 校验控制 JSON，并在失败时自动修复一次。
- 规则层负责属性计算、隐藏状态合并、终局判断和结算展示。
- 主线进度受当前轮次限制；进度达到 70 后，重大突破的边际收益会降低 1 点，保留最后阶段的决策压力。
- 终局由前端统一判定为死亡、失控、未完成、苦涩完成、标准完成或完美完成，模型只负责对应文案。
- `story_arc` 维护主线目标、当前剧情线、未回收伏笔和终局方向，降低长线剧情跑偏。
- 攻击、防御和理智不做复杂战斗系统，只在行动指定的检查中参与轻量判定；攻击和防御跨过初始门槛后仍有分段减伤收益，风险行动保留最低伤害。
- 每局使用独立种子；同一种子的数值路线不因语言变化。
- 低理智重大轮始终提供三个不同计划；强属性只提高专属行动权重，不排除其他路线。
- 伤势解除、盟友死亡或离队使用显式移除字段；主目标保持不变，章节记录保留早期选择和关键事实。
- 末日世界增加援救居民、医护支援、后期护送撤离的持续分支。
- 退出或重开会隔离旧请求，正文和终幕设置90秒超时，界面连接状态依据真实请求更新。

</details>

<details>
<summary>ChoicePlan 与两段式生成</summary>

## 核心设计

本项目的重点不是“让 AI 随便讲故事”，而是把 AI 放在一个可控的游戏循环里。

```text
玩家点击选项
↓
前端读取该选项的 ChoicePlan
↓
LLM 完整生成本轮剧情文本，页面端逐步播放
↓
LLM 非流式生成控制 JSON
↓
Zod 校验 / 自动修复
↓
前端规则层计算真实属性变化
↓
展示本轮结算和下一轮选项
```

### ChoicePlan

每个选项在展示给玩家之前，前端会先生成隐藏的 `ChoicePlan`：

```ts
type ChoicePlan = {
  risk_label: string;
  tone: 'calm' | 'gain' | 'loss' | 'tradeoff' | 'major_gain' | 'major_loss';
  stat_changes: Partial<PlayerStats>;
  progress: number;
  intent: string;
  settlement_hint: string;
  checks: ('attack' | 'defense' | 'sanity')[];
};
```

AI 只负责把这些隐藏计划改写成自然的选项文本，不能改变数值结果和主线推进。

`ChoicePlan` 不是固定 A/B/C 模板。前端会根据当前轮次、世界、语言、角色状态和主线进度，从结果池里抽取三种计划并打乱到 A/B/C，再交给 AI 包装成选项文本。

追击推进提高至2，重大极限行动推进提高至4，并降低部分重大行动损耗。进度采用两层节奏控制：任何一轮都不能让进度超过当前轮次允许的上限；当进度达到 70 后，`progress >= 3` 的重大突破按少 1 点结算。普通推进仍保持原收益。被轮次上限截断的推进最多转为2点防护准备；属性达到上限后的结算只展示实际增减。

低理智会影响选项池和危险判定：理智偏低时更容易出现慌乱、强稳心神、失控或定魂类计划；定魂属于概率出现的高额恢复选项，SAN 越低出现权重越高但不保证每轮出现。生命恢复以35%的权重独立出现在普通准备位，不依赖当前 HP，分为包扎（+18）、急救（+30）和彻底休整（+45）三档；末日居民支线节点会替换该准备位。遇到战斗、伏击、逃脱、陷阱、危险环境、反转或仪式等事件时，低理智会加重已有生命损失，并在结算区展示原因。

### 两段式生成

每轮生成拆成两次请求：

1. 剧情文本生成  
   使用非流式请求拿到完整正文，再由页面端逐步播放，避免正文流和选项控制请求互相等待。

2. 控制 JSON 生成
   使用非流式、低温、短 JSON 输出，只负责事件类型、摘要、隐藏状态、`story_arc` 和下一轮选项文本。

终幕生成使用统一的 `finale_v1` 结构。前端根据生命、轮次、主线进度和理智计算 `ending_kind`，模型不能自行改变结局类型。

这样可以减少长文本 JSON 截断、格式不合法、模型乱改数值等问题。

</details>

<details>
<summary>项目结构与职责划分</summary>

## 项目结构

```text
src/
  App.tsx
  main.tsx
  styles.css
  data/
    worlds.ts
  game/
    ai.ts
    prompts.ts
    rules.ts
    schemas.ts
    types.ts
  services/
    llmClient.ts
  utils/
    json.ts
public/
  assets/
    ui/
    worlds/
    protagonists/
```

关键模块：

- `src/game/prompts.ts`：Prompt 构建。
- `src/game/ai.ts`：LLM 调用、剧情解析、JSON 校验和修复。
- `src/game/rules.ts`：ChoicePlan、属性结算、隐藏状态、终局判断。
- `src/game/schemas.ts`：Zod schema。
- `src/services/llmClient.ts`：OpenAI 兼容接口调用。
- `src/data/worlds.ts`：世界设定和素材配置。

## 和普通 AI 文字冒险的区别

很多 AI 文字冒险项目会让模型直接决定故事、选项和数值结果，容易出现数值漂移、越界、前后矛盾或格式失败。

本项目把职责拆开：

- AI 负责：叙事、选项文案、摘要、伏笔整理。
- 前端规则层负责：数值、状态、终局、主线推进。
- Zod 负责：控制 JSON 结构校验。

这种结构更适合做长线、多轮、可演示的 AI 游戏 Demo。

</details>

<details>
<summary>居民支线与结局条件</summary>

## 居民支线与结局

末日世界在第10、15、20轮提供援救机会。选择援救后，获救医护会在补给可用时提供治疗；治疗有6轮冷却。第70轮起，每5轮出现护送居民撤离的机会，完成后记入终局。该状态由规则层维护，模型不能自行宣称分支完成。

完美结局需要至少一条关键线索、最多两条未回收伏笔以及60以上理智；通常要求90进度，成功护送居民后门槛为85。其他结局仍按原来的进度和理智区间决定，死亡优先。

`removed_allies` 和 `healed_injuries` 使用现有名称删除当前状态；普通数组仍表示新增内容。每10轮归档一次章节记录，保留选择、结果及关键事实。这里的章节记忆仅在本局内存中，不是存档功能。

</details>

## 技术栈

- React 19
- TypeScript
- Vite 7
- Zod
- lucide-react
- OpenAI 兼容 Chat Completions API

## 后续方向

- 增加更多世界和主角素材。
- 优化移动端布局。
- 增加本地存档或导出冒险记录。
- 增加后端代理，支持安全公网部署。
- 增加更细的事件判定和世界专属规则。
- 增加自动化测试，覆盖 JSON 修复和状态结算。

## License

项目代码采用 [MIT License](./LICENSE)，允许在保留许可声明的前提下使用、修改和分发，包括商业用途。

图片由项目作者使用 GPT 生成，来源与使用说明见 [ASSETS.md](./ASSETS.md)。依赖及图标声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
