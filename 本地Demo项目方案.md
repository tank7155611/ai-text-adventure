# AI 文字冒险游戏本地 Demo 项目方案

## 1. 目标

本方案用于在本地快速做出一个可演示的 Web Demo，完整保留 `需求.md` 中规划的核心功能，不做玩法阉割。

Demo 目标：

1. 支持完整 100 轮游戏流程。
2. 支持世界选择、世界详情、开场剧情、每轮三选项、属性面板、事件结算、终局生成。
3. 使用 OpenAI 兼容接口调用大模型。
4. 使用 `gpt-5.5`；剧情正文采用非流式完整响应，控制 JSON 采用非流式低温结构化请求，正文由前端逐步播放。
5. 前端负责全部游戏状态计算、JSON 校验、隐藏状态合并、`story_arc` 维护和 UI 展示。
6. 不做账号系统，不做云端存档，不做数据库。
7. 不加入服务器业务逻辑；本地演示阶段优先纯前端实现。

说明：

* 本地 Demo 的 API Key 放在 `.env.local`，由 Vite 本地代理读取并注入请求头，浏览器不读取密钥；禁止给密钥变量添加 `VITE_` 前缀。
* 如果后续要部署到公网、发给别人试玩或做正式产品，必须改成后端代理调用大模型，不能把 API Key 放在前端。

---

## 2. 技术栈

推荐：

```text
Vite
React
TypeScript
Zod
CSS Modules 或普通 CSS
lucide-react
```

选择理由：

* Vite 启动快，适合本地 Demo。
* React 适合做状态驱动 UI。
* TypeScript 可以约束游戏状态结构。
* Zod 用于校验大模型返回 JSON。
* lucide-react 用于按钮、状态、面板图标。

暂不引入：

* 数据库
* 用户登录
* 服务端框架
* 状态管理库
* 路由库
* UI 组件库

如果后续状态复杂度上升，再考虑 Zustand。

---

## 3. 接口配置

当前可用 OpenAI 兼容接口：

```text
BASE_URL=https://openrouter.chipltech.com/v1
MODEL=gpt-5.5
ENDPOINT=/chat/completions
```

`.env.local` 示例：

```env
VITE_OPENAI_COMPAT_BASE_URL=https://openrouter.chipltech.com/v1
VITE_OPENAI_COMPAT_MODEL=gpt-5.5
OPENAI_COMPAT_API_KEY=请填写你自己的 API Key
```

注意：

1. 不要把真实 API Key 写进代码。
2. 不要提交 `.env.local`。
3. 剧情正文请求使用 `stream: false`，拿到完整文本后由前端逐步展示，避免正文和选项控制请求互相等待。
4. 控制 JSON 和 JSON 修复请求使用 `stream: false`、低温参数和 `response_format: json_object`；如果接口不支持 `response_format`，客户端自动降级重试。

剧情文本请求格式：

```json
{
  "model": "gpt-5.5",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "..."
    }
  ]
}
```

剧情文本返回格式是 SSE：

```text
data: {...}
data: {...}
data: [DONE]
```

前端需要从每个 chunk 的：

```json
choices[0].delta.content
```

中拼接模型输出文本。

控制 JSON 请求格式：

```json
{
  "model": "gpt-5.5",
  "stream": false,
  "temperature": 0,
  "response_format": {
    "type": "json_object"
  },
  "messages": [
    {
      "role": "user",
      "content": "..."
    }
  ]
}
```

控制 JSON 只用于结构化整理，不用于展示长正文。

---

## 4. 项目结构

当前 Demo 目录：

```text
开放世界文字游戏/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  .env.local
  .gitignore
  public/
    assets/
      ui/
        home-background.png
        game-background.png
        panel-texture.png
      worlds/
        magic-world.png
        apocalypse-survival.png
        sci-fi-future.png
        xianxia-east.png
        steampunk-city.png
        undersea-civilization.png
      protagonists/
        magic.png
        apocalypse.png
        scifi.png
        xianxia.png
        steampunk.png
        undersea.png
  src/
    main.tsx
    App.tsx
    styles.css
    data/
      worlds.ts
    game/
      types.ts
      rules.ts
      prompts.ts
      schemas.ts
      ai.ts
    services/
      llmClient.ts
    utils/
      json.ts
```

---

## 5. 核心架构

本地 Demo 采用前端单体架构：

```text
React UI
  ↓ 用户点击选项
Game Controller
  ↓ 组装剧情 Prompt
LLM Client
  ↓ stream: false
OpenAI 兼容接口
  ↓ 完整剧情文本
Story Parser
  ↓ 得到 story.title + story.body
Game Controller
  ↓ 组装控制 JSON Prompt
LLM Client
  ↓ stream: false, temperature: 0
OpenAI 兼容接口
  ↓ 短 JSON 文本
Zod Schema 校验控制 JSON
  ↓
失败：JSON 修复一次
  ↓
游戏规则层计算最终状态
  ↓
React UI 展示
```

职责划分：

| 模块 | 职责 |
| --- | --- |
| `App.tsx` | 组织页面状态、用户交互、开场/每轮/终局流程和 UI 展示 |
| `data/worlds.ts` | 定义六个世界、背景、主角身份、封面和素材路径 |
| `game/prompts.ts` | 构建剧情文本、控制 JSON、终局、JSON 修复 Prompt |
| `game/ai.ts` | 调用 LLM、解析剧情文本、校验/修复 JSON、合并 ChoicePlan 选项文本 |
| `game/schemas.ts` | 使用 Zod 校验控制 JSON 和终局 JSON |
| `game/rules.ts` | 生成 ChoicePlan、计算属性、隐藏状态、叙事轨道、结算和终局状态 |
| `services/llmClient.ts` | 调用 OpenAI 兼容接口，处理流式和非流式响应 |
| `utils/json.ts` | 提取和解析模型返回中的 JSON |

---

## 6. 游戏状态设计

### 6.1 玩家属性

```ts
type PlayerStats = {
  hp: number;
  atk: number;
  def: number;
  san: number;
};
```

范围：

```text
hp: 0-100
atk: 1-30
def: 1-30
san: 0-100
```

### 6.2 隐藏状态

```ts
type HiddenState = {
  progress: number;
  key_clues: string[];
  allies: string[];
  injuries: string[];
  flags: string[];
  major_choices: string[];
};
```

### 6.3 叙事轨道

```ts
type StoryArc = {
  main_goal: string;
  current_thread: string;
  unresolved_hooks: string[];
  tension_level: number;
  finale_direction: string;
};
```

`story_arc` 用于防止 100 轮过程中剧情漂移。它不是历史摘要，而是告诉模型：

* 当前冒险的核心目标是什么。
* 当前正在推进哪条剧情线。
* 哪些伏笔还没回收。
* 紧张度是否正在上升。
* 最终结局应该围绕什么展开。

### 6.4 游戏状态

```ts
type GameStatus = 'idle' | 'playing' | 'failed' | 'completed';

type GameState = {
  status: GameStatus;
  round: number;
  world: WorldDefinition;
  player_stats: PlayerStats;
  hidden_state: HiddenState;
  story_arc: StoryArc;
  current_story: Story;
  choices: Choice[];
  recent_history: HistoryEntry[];
  game_history_summary: string;
  last_settlement?: RoundSettlement;
  finale?: FinaleOutput;
};
```

---

## 7. 大模型输出设计

大模型不直接返回最终 `player_stats`，也不决定本轮具体加减数字。每轮采用“预设选项后果 + 两段式生成”：

1. 前端规则层在生成每批 A/B/C 选项前，先创建对应轮次的隐藏 `ChoicePlan`。
2. AI 根据该批 `ChoicePlan` 为三个选项写贴合当前剧情的选项文本。
3. 玩家选择后，第一段 AI 根据“玩家选择 + 预设 ChoicePlan”生成完整纯剧情文本，前端以流式样式展示。
4. 第二段 AI 根据已经生成的剧情文本返回短控制 JSON，只负责事件类型、剧情摘要、隐藏状态、story_arc 和下一轮选项文本。

第一段剧情文本输出：

```text
标题：2-40字标题

正文：
300-700字中文剧情正文，2-5段
```

选项内置后果：

```ts
type ChoicePlan = {
  risk_label: '稳妥' | '冒险' | '准备' | '突破' | '代价' | '恢复';
  tone: 'calm' | 'gain' | 'loss' | 'tradeoff' | 'major_gain' | 'major_loss';
  stat_changes: Partial<PlayerStats>;
  progress: number;
  intent: string;
  settlement_hint: string;
  checks: ('attack' | 'defense' | 'sanity')[];
};

type Choice = {
  id: 'A' | 'B' | 'C';
  text: string;
  plan: ChoicePlan;
};
```

第二段控制 JSON 输出：

```ts
type ModelControlOutput = {
  schema_version: 'round_control_v1';
  resolution: Resolution;
  hidden_state_updates: HiddenStateUpdates;
  story_arc_updates?: StoryArcUpdates;
  choices: Array<{ id: 'A' | 'B' | 'C'; text: string }>;
};

type ModelRoundOutput = Omit<ModelControlOutput, 'schema_version'> & {
  schema_version: 'round_event_v1';
  story: Story;
};
```

关键规则：

1. 剧情文本不放进 JSON，避免长文本导致 JSON 截断或格式失败。
2. 控制 JSON 不新增剧情事实，只整理已生成剧情中的结果、状态更新和下一轮选项文本。
3. 模型不返回完整 `player_stats`。
4. 模型不返回完整 `hidden_state`。
5. 模型不返回最终 `status`。
6. 前端规则层根据玩家选择的 `ChoicePlan.stat_changes` 计算基础属性变化。
7. 前端规则层负责合并隐藏状态。
8. 前端规则层负责判断 `playing / failed / completed`。
9. `ChoicePlan.settlement_hint` 用于轻量结算区展示原因短句。

---

## 8. 状态计算规则

### 8.1 属性变化

```ts
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyStatChanges(
  current: PlayerStats,
  changes: Partial<PlayerStats>
): PlayerStats {
  return {
    hp: clamp(current.hp + (changes.hp ?? 0), 0, 100),
    atk: clamp(current.atk + (changes.atk ?? 0), 1, 30),
    def: clamp(current.def + (changes.def ?? 0), 1, 30),
    san: clamp(current.san + (changes.san ?? 0), 0, 100)
  };
}
```

属性变化不由模型决定，而是由前端在生成选项时从 `ChoicePlan` 结果池中预设。玩家点击选项后，前端读取该选项的 `stat_changes` 作为基础变化，再根据本轮 `resolution.event_type` 和当前攻击/防御做轻量修正，最后统一 clamp 到合法范围。

```text
每轮生成选项前，前端根据当前轮次、世界、语言、生命、理智、攻击、防御和 hidden_state.progress 组装 ChoicePlanContext。

普通轮：
从 steady / risk / prepare 三类结果池各抽取 1 个计划，再确定性打乱到 A/B/C。

大事件轮：
从 major 结果池抽取 2 个计划，再从 prepare 结果池抽取 1 个计划，并确定性打乱到 A/B/C。

状态影响：
生命恢复不再与当前 HP 挂钩。prepare 槽位以独立权重抽取生命恢复计划：总体约 30% 的准备位会出现包扎、急救或彻底休整，其中权重约为 18:9:3；低理智时，定魂等高额理智恢复计划再与生命恢复竞争同一准备位，但不保证出现。
低理智时，稳心类计划的出现权重提高；高额恢复类计划按 SAN 区间提高权重，但不保证每轮出现。
攻击偏低时，训练类计划更容易出现。
不同世界可以追加世界专属计划，例如东方玄幻会出现试炼、淬炼、外门历练等计划。

A/B/C 不再固定代表稳妥、冒险、恢复，玩家不能只通过字母判断结果倾向。
```

大事件触发轮次：

```ts
round >= 3 && (round - 3) % 5 === 0
```

即第 3、8、13、18... 轮触发大事件选项。

每个选项的 `ChoicePlan` 不直接展示给玩家，玩家只看到 AI 按该计划改写后的选项文本。

这样 AI 负责把预设结果写成符合当前世界和剧情的叙事，前端负责稳定计算真实数值。

真实结算公式：

```text
真实属性变化 =
玩家所选 ChoicePlan.stat_changes
+ 攻击/防御在特定 event_type 下产生的轻量生命修正
+ 低理智在危险 event_type 下产生的轻量生命修正
+ clamp 边界限制
```

攻击/防御轻量修正规则：

```text
只有当本轮基础变化包含生命损失时，才会检查攻击/防御。

攻击检查事件：
combat、ambush、escape、trap

防御检查事件：
combat、ambush、hazard、trap、escape

攻击过低：生命损失额外加重。
攻击较高：生命损失减轻。
防御过低：生命损失额外加重。
防御较高：生命损失减轻。
```

这部分修正不由 AI 直接决定。AI 只返回 `resolution.event_type`，规则层根据事件类型和当前属性自动计算。结算区需要展示 `ChoicePlan.settlement_hint`，并在触发攻击、防御或理智修正时额外展示修正原因。

### 8.2 隐藏状态合并

```ts
function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function applyHiddenStateUpdates(
  current: HiddenState,
  updates: HiddenStateUpdates
): HiddenState {
  return {
    progress: clamp(current.progress + (updates.progress ?? 0), 0, 100),
    key_clues: unique([...current.key_clues, ...(updates.key_clues ?? [])]),
    allies: unique([...current.allies, ...(updates.allies ?? [])]),
    injuries: unique([...current.injuries, ...(updates.injuries ?? [])]),
    flags: unique([...current.flags, ...(updates.flags ?? [])]),
    major_choices: unique([...current.major_choices, ...(updates.major_choices ?? [])])
  };
}
```

说明：控制 JSON 中的 `hidden_state_updates.progress` 必须固定为 `0`。每轮真实主线推进量由玩家所选 `ChoicePlan.progress` 覆盖写入，再通过 `applyHiddenStateUpdates` 合并。

### 8.3 叙事轨道合并

```ts
function applyStoryArcUpdates(
  current: StoryArc,
  updates?: Partial<StoryArc>
): StoryArc {
  if (!updates) return current;

  return {
    main_goal: updates.main_goal?.trim() || current.main_goal,
    current_thread: updates.current_thread?.trim() || current.current_thread,
    unresolved_hooks: unique([...(updates.unresolved_hooks ?? current.unresolved_hooks)]),
    tension_level: clamp(updates.tension_level ?? current.tension_level, 1, 5),
    finale_direction: updates.finale_direction?.trim() || current.finale_direction
  };
}
```

### 8.4 游戏状态判断

```ts
function resolveStatus(round: number, stats: PlayerStats): GameStatus {
  if (stats.hp <= 0) return 'failed';
  if (round >= 100) return 'completed';
  return 'playing';
}
```

### 8.5 攻击与防御事件判定

攻击和防御不做复杂战斗系统，只在规则层参与事件修正。

基础流程：

```text
前端读取玩家所选 ChoicePlan.stat_changes 和 checks
↓
AI 返回 event_type 和剧情摘要；event_type 只用于叙事分类
↓
如果本轮有生命损失，并且 ChoicePlan.checks 包含对应判定
↓
根据当前 atk / def 轻量修正 hp 损失
↓
结算区展示修正说明
```

推荐规则：

```text
如果 atk <= 9 且 checks 包含 attack：额外生命 -7，说明“攻击不足，行动代价加重”。
如果 atk >= 16 且 checks 包含 attack：生命损失减少 5，说明“攻击压制降低了危险”。

如果 def <= 6 且 checks 包含 defense：额外生命 -7，说明“防御不足，承受了更多伤害”。
如果 def >= 12 且 checks 包含 defense：生命损失减少 5，说明“防御抵消了部分伤害”。

单次扣血上限：普通行动最多 -25 HP；重大突破（ChoicePlan.progress >= 3）最多 -35 HP。

修正只作用于已有生命损失，不会把生命损失变成生命恢复。
```

### 8.5.1 理智事件判定

理智不作为第二条死亡线，不直接触发失败；失败依旧只由 `hp <= 0` 判断。

理智的作用分为三层：

```text
1. 理智会影响下一轮 ChoicePlan 结果池，高理智可出现清醒/洞察计划。
2. 理智会在 checks 包含 sanity 的行动中改变已有生命损失。
3. 理智会进入剧情 Prompt，让文本表现判断稳定、不稳、误认和恐惧反应。
```

规则层推荐：

```text
理智影响事件：
combat、ambush、escape、hazard、trap、twist、ritual

只有当本轮基础变化已经包含生命损失，且 checks 包含 sanity 时，才检查理智。

如果 san >= 70 且 checks 包含 sanity：生命损失减少 5，说明“清晰判断降低了危险”。
如果 san <= 30 且 checks 包含 sanity：额外生命 -7，说明“理智偏低，判断不稳增加了危险”。
如果 san <= 15 且 checks 包含 sanity：额外生命 -10，说明“理智濒临崩溃，严重误判加重了伤害”。

修正只作用于已有生命损失，不会把生命损失变成生命恢复。
```

选项池规则：

```text
san <= 30：
- risk 类更容易出现“慌乱”计划。
- prepare 类可能出现“强稳”计划。
- major 类可能出现“裂心”计划。

san <= 15：
- risk 类更容易出现“失控”计划。
- prepare 类按概率出现“定魂”计划，SAN 越低权重越高，但不保证出现。

san >= 70：
- steady 类可能出现“清醒”计划，恢复少量理智并稳定推进。
- checks 包含 sanity 的危险行动可获得“清晰判断”减损。

高额恢复权重：
- san 40-49：15%
- san 25-39：30%
- san 10-24：45%
- san 0-9：60%
- 同一上下文使用确定性种子计算，保证可复现；每轮最多出现一个高额恢复选项。
```

Prompt 规则：

```text
san <= 30：
剧情和选项体现迟疑、疑神疑鬼、过度反应、注意力不稳和判断代价。

san <= 15：
剧情和选项体现幻觉式压迫、误认敌意、判断颤抖、恐惧反应，以及重新确认现实的需求。

限制：
理智不稳只能作为主观感受，不能改写既有事实，也不能制造前后矛盾。
```

### 8.6 统一终幕生成流程

失败不由 AI 直接决定，必须由前端规则层判断。

流程：

```text
玩家点击选项
↓
前端读取该选项内置 ChoicePlan
↓
AI 根据玩家选择和 ChoicePlan 返回完整本轮剧情纯文本
↓
AI 根据已生成剧情返回控制 JSON
↓
前端规则层应用 ChoicePlan.stat_changes，并计算 next_player_stats
↓
resolveStatus(round, next_player_stats)
↓
如果 hp <= 0，状态进入 failed；否则第 100 轮进入 completed
↓
当前剧情页保留最后一轮剧情，并展示本轮结算区
↓
选项区不再展示行动选项，改为展示“查看终幕”按钮
↓
玩家点击“查看终幕”
↓
前端根据 `resolveEnding` 计算 `ending_kind`，再发起统一终幕 Prompt
↓
AI 返回统一 `finale_v1` JSON，只生成与 `ending_kind` 一致的终幕正文
↓
展示对应终幕页
```

关键规则：

* AI 每轮不能直接返回 `status: failed` 或 `game_over: true`。
* AI 不能返回属性加减、属性标签或最终数值。
* 真实 `stat_changes` 来自玩家所选 `ChoicePlan`。
* 前端负责 clamp 数值、判断运行状态和计算 `ending_kind`。
* 判定 `failed` 后，不立刻跳转失败页，必须先让玩家看到最后一轮剧情和本轮结算。
* 只有玩家点击“查看终幕”后，才允许调用统一终幕 Prompt。
* 统一终幕 Prompt 只生成终幕剧情，不再生成选项。
* 终幕剧情必须承接最后一轮事件，不能改写玩家已做过的关键选择。
* 如果终幕生成失败，则使用最后一轮剧情和结算描述作为兜底文案。

统一终幕输出：

```ts
type FinaleOutput = {
  schema_version: 'finale_v1';
  ending_kind: 'death' | 'collapse' | 'incomplete' | 'bittersweet' | 'standard' | 'perfect';
  title: string;
  finale_story: string;
};
```

---

## 9. JSON 校验与修复

第二段控制 JSON 和终局 JSON 必须经过：

```text
模型返回文本
↓
JSON.parse
↓
Zod schema 校验
↓
成功：进入状态计算
失败：发起一次 JSON 修复
↓
修复成功：进入状态计算
修复失败：不推进轮次，显示重试
```

JSON 修复 Prompt 只做结构修复，不改写剧情含义。

控制 JSON 生成要求：

* 不使用流式输出，避免 SSE 片段和文本拼接增加格式失败概率。
* 使用确定性参数，例如 `temperature: 0`。
* 输出上限控制在短 JSON 范围，例如 `max_tokens: 1200`。
* 优先请求 `response_format: { "type": "json_object" }`；如果 OpenAI 兼容接口不支持该参数，则自动移除该参数重试一次。

JSON 修复要求：

* 不使用流式输出。
* 使用更低温参数，例如 `temperature: 0`。
* 修复 Prompt 必须携带第一次 JSON parse / Zod schema 校验失败的具体错误。

控制 JSON 修复失败时：

* 不推进轮次。
* 不扣属性。
* 不更新 `hidden_state`。
* 不更新 `story_arc`。
* 保留已经流式展示出来的剧情正文。
* 在选项区域显示错误态和“重新生成选项”按钮。
* 点击“重新生成选项”时，使用本轮开始前的 `game_state`、同一个玩家选择和已生成的 `story` 重新调用控制 JSON Prompt。
* 不重新生成剧情正文，避免玩家已经看到的剧情被改写。

### 9.1 Prompt 与 Schema 实际实现

本节内容必须和当前 Demo 源码保持一致。当前实现文件：

```text
src/game/prompts.ts
src/game/schemas.ts
src/game/ai.ts
```

#### 9.1.1 第一段：剧情文本 Prompt

开场使用 `buildOpeningStoryPrompt(world)`，每轮使用 `buildRoundStoryPrompt(game, selectedChoice)`。

通用输出规则：

```text
只返回纯文本，不要 JSON，不要 Markdown，不要代码块。
输出格式必须是：
标题：2-40字标题

正文：
300-700字中文剧情正文，2-5段。
```

开场剧情 Prompt 必须包含：

```text
世界名称、基调、世界概览、世界背景、世界局势、核心悬念、玩家身份、主目标、当前剧情线。
只写已经发生的开场局面，不生成行动选项。
不要出现属性变化、结算、系统提示、JSON 字段。
不要替玩家做出后续选择。
正文必须给玩家留下明确但开放的行动空间。
```

每轮剧情 Prompt 必须包含：

```text
世界信息、当前 game_state、hidden_state、story_arc、最近3轮、历史摘要。
上一轮标题、上一轮正文、玩家选择。
只写本轮实际发生的剧情，不生成下一轮行动选项。
不要写属性变化、结算摘要、JSON 字段或系统状态。
不要直接宣布 failed、completed、game_over 或游戏结束。
剧情必须承接玩家选择和 story_arc，不要跳到无关主线。
本轮事件不要总是精神污染或异常凝视；可以包含探索、交涉、战斗、陷阱、休整、治疗、训练、装备加固、获得资源、同伴帮助等不同类型。
如果玩家选择偏谨慎或准备，可以让剧情出现恢复、加固、绕行、资源利用或信息整理，而不是必然受损。
正文必须有实际进展和阶段性结果，不要只写氛围、观察和悬念。
正文最后要停在一个适合生成三选项的局面。
```

本轮剧情必须包含：

```text
一个明确行动：主角真的做了什么，而不是只观察气氛。
一个阻碍、机会或代价：危险、消耗、发现、支援、训练、修复、谈判、恢复、资源变化等。
一个阶段性结果：脱险、受伤、恢复、获得线索、装备改善、攻击方式变熟、防护增强、失去资源、得到帮助、触发陷阱等。
一个新的选择局面：最后停在玩家可以做出下一步选择的位置。
```

可结算事件锚点：

```text
生命变化锚点：擦伤、撞击、中毒、疲惫、包扎、治疗、短暂喘息、获得补给。
理智变化锚点：恐惧、混乱、真相冲击、稳定情绪、得到解释、同伴安抚、确认安全。
攻击变化锚点：获得武器、改装工具、练习招式、掌握敌人弱点、能量增强。
防御变化锚点：加固护具、找到掩体、修复屏障、获得护符、学会规避攻击。
无变化锚点：纯信息整理、平稳对话、低风险移动，但不要连续多轮无变化。
每轮正文至少要自然包含一个锚点，除非这是第 1 轮开场。不要在正文里写具体数值。
```

#### 9.1.2 第二段：控制 JSON Prompt

开场使用 `buildOpeningControlPrompt(world, story, plannedChoices)`，每轮使用 `buildRoundControlPrompt(game, selectedChoice, story, plannedChoices)`。

控制 JSON 只允许整理已经生成的剧情，不能新增剧情事实，也不能决定属性变化。

控制 JSON 字段契约：

```text
- schema_version: 必须精确等于 "round_control_v1"
- resolution.summary: 2-300 字中文短句
- resolution.event_type: 只能是 "normal", "exploration", "investigation", "social", "negotiation", "combat", "ambush", "escape", "stealth", "hazard", "trap", "puzzle", "discovery", "twist", "rest", "recovery", "training", "upgrade", "resource", "ally", "sacrifice", "ritual" 其中一个
- hidden_state_updates: 必须是对象；没有更新时使用空数组和 progress: 0
- hidden_state_updates.progress: 整数，固定返回 0；真实主线推进由前端按 `ChoicePlan.progress` 计算
- hidden_state_updates.key_clues/allies/injuries/flags: 字符串数组，最多 5 项
- hidden_state_updates.major_choices: 字符串数组，最多 5 项
- story_arc_updates: 对象；必须包含 current_thread、unresolved_hooks、tension_level、finale_direction
- story_arc_updates.tension_level: 整数，范围 1 到 5
- choices: 必须正好 3 项，id 必须依次为 "A", "B", "C"，text 为 2-80 字中文行动
```

控制 JSON 合法示例：

```json
{
  "schema_version": "round_control_v1",
  "resolution": {
    "summary": "主角利用现有材料完成临时加固，为继续深入争取了余地。",
    "event_type": "upgrade"
  },
  "hidden_state_updates": {
    "progress": 0,
    "key_clues": [],
    "allies": [],
    "injuries": [],
    "flags": ["完成一次临时准备"],
    "major_choices": []
  },
  "story_arc_updates": {
    "current_thread": "带着临时加固继续推进主线",
    "unresolved_hooks": ["前方真正的阻碍尚未显露"],
    "tension_level": 2,
    "finale_direction": "主角逐步积累足以接近核心真相的优势"
  },
  "choices": [
    { "id": "A", "text": "趁准备完成立刻推进" },
    { "id": "B", "text": "先验证加固是否可靠" },
    { "id": "C", "text": "寻找更多可用资源再行动" }
  ]
}
```

事件类型参考：

```text
normal: 普通推进，无明显风险或收益
exploration: 探索新区域、进入未知地点
investigation: 调查线索、验证推断
social: 对话、关系变化、获取态度
negotiation: 交易、谈判、说服、交换条件
combat: 正面战斗
ambush: 伏击、突袭、突然受袭
escape: 逃脱、追逐、摆脱危险
stealth: 潜行、绕行、避开正面冲突
hazard: 环境危险、坍塌、毒雾、压力、风暴等
trap: 陷阱、机关、封锁、误触装置
puzzle: 解谜、破解、机关推演
discovery: 发现重要线索或新事实
twist: 反转、真相偏移、可信信息被推翻
rest: 短暂休整、喘息、整理状态
recovery: 治疗、恢复、稳定理智
training: 训练、领悟、熟练度提升
upgrade: 武器、防具、工具、护符或装备升级
resource: 获得或消耗补给、材料、能量
ally: 获得同伴、支援、临时帮助
sacrifice: 付出代价换取推进
ritual: 仪式、魔法、世界机制或特殊规则触发
```

ChoicePlan 结果池规则：

```text
属性变化不由控制 JSON 决定，而是由前端的 createPlannedChoices(context) 预设。

context 包含：
round
language
worldId
player_stats
hidden_state.progress

普通轮：
从 steady / risk / prepare 三类结果池各取 1 个。

大事件轮：
从 major 结果池取 2 个，从 prepare 结果池取 1 个。

大事件触发轮次：
第 3 轮开始，之后每 5 轮一次，即 3、8、13、18...

抽取规则：
使用轮次、世界、语言、progress 和当前属性作为 seed，做确定性抽取和洗牌。
同一轮重试控制 JSON 时复用同一批 plannedChoices，不重新抽。
低生命、低理智、低攻击、低防御会影响可用计划池。
世界可以追加专属结果池，不影响其他世界。
```

选项方向规则：

```text
三个选项都必须承接当前剧情最后局面。
A 通常偏主动推进、冒险、正面处理。
B 通常偏谨慎调查、防御、观察、验证。
C 通常偏恢复、准备、绕行、交涉、利用资源或寻找支援。
不要让三个选项都只是调查异常、靠近异常或凝视异常。
```

预设选项计划规则：

```text
前端在生成每批 A/B/C 选项前，先创建对应轮次的 ChoicePlan。
开场时创建第 1 轮 ChoicePlan；每轮剧情结束后创建下一轮 ChoicePlan。
AI 对 choices 字段只能根据 ChoicePlan 改写 text，不能改变 id、预设数值结果、progress、风险标签或叙事意图。
选项文本不能出现具体数值、加减号或属性名。
玩家点击选项后，本轮剧情 Prompt 会携带该选项的 ChoicePlan。
普通轮次开始请求剧情时，前端先根据预测的下一轮状态生成 `plannedChoices`，但控制 JSON 完成前不展示默认选项；完整剧情返回后发起控制 JSON 请求，成功后显示并解锁最终选项文案。
剧情正文需要自然解释 ChoicePlan 中的基础属性变化，但不能写出具体数值。
真实属性变化由 applyRoundOutput 计算：先应用 ChoicePlan.stat_changes，再根据 event_type 做攻击/防御轻量修正，最后 clamp。
攻击和防御只在特定 event_type 下对生命损失做轻量修正；这部分由结算区展示原因，不要求剧情正文提前写出具体修正。
控制 JSON 的 hidden_state_updates.progress 固定为 0，真实主线推进由 ChoicePlan.progress 控制；规则层会限制进度不超过当前轮次，避免前期提前打满。进度达到 70 后，`progress >= 3` 的重大突破边际收益降低 1 点，普通推进收益不变，以保留终局前的决策压力。
```

控制 JSON 硬性规则：

```text
1. 不能返回 status、failed、completed、game_over。
2. 不能返回 hp、san、atk、def、属性标签、属性加减或最终数值。
3. 控制 JSON 不能返回 stat_effects、属性加减、最终数值或 status。
4. choices 必须正好 3 个，id 为 A/B/C。
5. choices 必须承接本轮正文最后的局面。
6. hidden_state_updates 和 story_arc_updates 只能提取或延续正文已经发生的信息。
7. choices 只能改写 text，不能改变每个选项的预设结果。
8. 不能使用带竖线的占位字符串，例如 "normal|combat|..."。
9. 必须参考示例格式，但不能照抄示例内容。
10. 根据正文选择最贴近的 event_type，不要总是使用 discovery、twist 或 ritual。
```

#### 9.1.3 两段式编排流程

实际调用顺序必须是：

```ts
const selectedChoice = getSelectedChoice(game.choices, choiceId);
const story = await generateRoundStory(game, selectedChoice, signal);
const predictedStats = applyStatChanges(game.player_stats, selectedChoice.plan.stat_changes);
const nextPlannedChoices = createPlannedChoices({
  round: game.round + 1,
  language: game.language,
  worldId: game.world.id,
  stats: predictedStats,
  progress: game.hidden_state.progress + selectedChoice.plan.progress
});
const control = await generateRoundControl(game, selectedChoice, story, nextPlannedChoices, signal);
const output = {
  ...control,
  schema_version: 'round_event_v1',
  story
};
const { nextGame, status } = applyRoundOutput(game, output, selectedChoice);
```

开场同理：

```ts
const intro = buildOpeningIntro(world);
const openingStoryPromise = generateOpeningStory(world, signal);
await streamLocalIntro(intro);
const openingStory = await openingStoryPromise;
const story = mergeOpeningStories(intro, openingStory);
const plannedChoices = createPlannedChoices({
  round: 1,
  language: world.language,
  worldId: world.id,
  stats: INITIAL_STATS,
  progress: 0
});
const control = await generateOpeningControl(world, story, plannedChoices, signal);
```

其中：

* `buildOpeningIntro` 根据世界设定生成本地背景故事，不调用模型。
* 点击“开始冒险”后，右侧剧情区先逐步展示本地背景故事，同时并行请求完整的 AI 开场剧情。
* 本地背景故事展示完成后，如果 AI 开场剧情尚未返回，则在背景故事下方显示行内 loading。
* AI 开场剧情返回后，控制 JSON 请求立即启动；前端将本地背景和 AI 开场整体逐步播放。
* 开场和普通轮次都使用非流式请求获取完整正文，再由前端逐步播放，保持统一的流式视觉效果。
* `generateOpeningControl` / `generateRoundControl` 负责生成短控制 JSON 和按计划改写选项文本。
* `applyRoundOutput` 负责应用玩家所选 `ChoicePlan.stat_changes`，并判断失败或 100 轮完成。
* 控制 JSON 失败时只重试 `generateOpeningControl` 或 `generateRoundControl`，不重写已经展示的剧情。

#### 9.1.4 统一终局 Prompt

当前实现使用 `buildFinalePrompt(game, ending)`，其中 `ending` 必须来自前端 `resolveEnding`。Prompt 会将结局类型、判定上下文、最终属性、`hidden_state`、`story_arc`、最近 3 轮和历史摘要传给模型，并要求模型返回统一结构：

```ts
type FinaleOutput = {
  schema_version: 'finale_v1';
  ending_kind: 'death' | 'collapse' | 'incomplete' | 'bittersweet' | 'standard' | 'perfect';
  title: string;
  finale_story: string;
};
```

模型只能生成对应类型的叙事文本，不能修改 `ending_kind`，也不能生成评分、选项或新的行动。

#### 9.1.6 JSON 修复 Prompt

```ts
export function buildJsonRepairPrompt(rawText: string, schemaName: 'control' | 'finale', validationError: string) {
  const schema = schemaName === 'control' ? controlSchemaDescription : finaleSchemaDescription;
  const example = schemaName === 'control' ? roundControlExample : finaleOutputExample;

  return [
    {
      role: 'system' as const,
      content: `你是 JSON 修复器。只能修复结构和字段，不要改写剧情含义。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `把下面内容修复为合法 JSON，并严格符合结构。不要添加解释。

字段契约：
${schema}

合法示例：
${example}

校验错误：
${validationError}

修复规则：
1. 只返回修复后的 JSON 对象。
2. 字段名必须和示例一致，不能新增字段。
3. 枚举值必须从字段契约中选择一个，不能使用带竖线的占位字符串。
4. 如果原内容缺少可恢复字段，按待修复内容的语义补齐；无法判断时使用最保守的合法值。

待修复内容：
${rawText}`
    }
  ];
}
```

#### 9.1.7 Zod Schema

对应文件：`src/game/schemas.ts`。

```ts
import { z } from 'zod';
import { EVENT_TYPES } from './types';

const choiceSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  text: z.string().min(2).max(80)
});

export const controlOutputSchema = z
  .object({
    schema_version: z.literal('round_control_v1'),
    resolution: z.object({
      summary: z.string().min(2).max(300),
      event_type: z.enum(EVENT_TYPES)
    }),
    hidden_state_updates: z
      .object({
        progress: z.literal(0).optional(),
        key_clues: z.array(z.string().min(1).max(40)).max(5).optional(),
        allies: z.array(z.string().min(1).max(40)).max(5).optional(),
        injuries: z.array(z.string().min(1).max(40)).max(5).optional(),
        flags: z.array(z.string().min(1).max(40)).max(5).optional(),
        major_choices: z.array(z.string().min(1).max(80)).max(5).optional()
      })
      .strict(),
    story_arc_updates: z
      .object({
        main_goal: z.string().min(2).max(120).optional(),
        current_thread: z.string().min(2).max(160).optional(),
        unresolved_hooks: z.array(z.string().min(1).max(80)).max(8).optional(),
        tension_level: z.number().int().min(1).max(5).optional(),
        finale_direction: z.string().min(2).max(160).optional()
      })
      .strict()
      .optional(),
    choices: z.array(choiceSchema).length(3)
  })
  .strict();

export const finaleOutputSchema = z
  .object({
    schema_version: z.literal('finale_v1'),
    ending_kind: z.enum(['death', 'collapse', 'incomplete', 'bittersweet', 'standard', 'perfect']),
    title: z.string().min(2).max(40),
    finale_story: z.string().min(80).max(2600)
  })
  .strict();

export type ControlOutputSchema = z.infer<typeof controlOutputSchema>;
export type FinaleOutputSchema = z.infer<typeof finaleOutputSchema>;
```

#### 9.1.8 校验与修复实际流程

```ts
async function parseWithRepair<T>(
  rawText: string,
  schema: z.ZodType<T>,
  repairKind: 'control' | 'finale',
  signal?: AbortSignal
) {
  let validationError = '未知错误';

  try {
    const parsed = parseJsonObject(rawText);
    const first = schema.safeParse(parsed);
    if (first.success) return first.data;
    validationError = formatZodError(first.error);
  } catch {
    validationError = 'JSON 解析失败：返回内容不是合法 JSON 对象，或存在多余文本、缺失括号、缺失引号、非法逗号。';
  }

  const repaired = await chatCompletion(
    buildJsonRepairPrompt(rawText, repairKind, validationError),
    signal,
    undefined,
    {
      stream: false,
      temperature: 0,
      maxTokens: 1600,
      responseFormat: 'json_object',
      retryWithoutResponseFormat: true
    }
  );
  try {
    const second = schema.safeParse(parseJsonObject(repaired));
    if (second.success) return second.data;
  } catch {
    // Fall through to the unified error below.
  }

  throw new Error('AI 返回 JSON 结构不符合要求，自动修复也失败。');
}
```

如果第二次仍失败：

* 本轮不推进。
* 当前属性不变化。
* `hidden_state` 不更新。
* `story_arc` 不更新。
* 已生成剧情保留，UI 在选项区显示错误态和“重新生成选项”按钮。

---

## 10. 主要页面

### 10.1 世界选择页

展示：

* 应用标题
* 副标题
* 6 个世界卡片
* 世界类型、危机、玩家目标、难度
* 查看背景
* 开始冒险

### 10.2 世界详情弹窗

展示：

* 世界概览
* 玩家身份
* 主要地点
* 主要势力
* 危险来源
* 主要目标
* 开局提示

### 10.3 游戏主页面

布局：

```text
左侧：玩家当前状态
右侧：剧情阅读区 + 行动选项
```

左侧玩家当前状态：

* 生命
* 理智
* 攻击
* 防御
* 当前世界主角图

主角图资产：

```text
魔法世界：/assets/protagonists/magic.png
末日生存：/assets/protagonists/apocalypse.png
科幻未来：/assets/protagonists/scifi.png
东方玄幻：/assets/protagonists/xianxia.png
蒸汽朋克：/assets/protagonists/steampunk.png
海底文明：/assets/protagonists/undersea.png
```

主角图展示规则：

* 位于左侧状态数值下方，填充原本空白区域。
* 根据当前世界 `world.id` 自动加载对应图片。
* 使用暗色遮罩和简短身份文案，保持和主界面统一。
* 不参与游戏规则计算，只作为当前世界的视觉代入。

右侧剧情阅读区：

* 当前轮次
* 剧情标题
* 剧情正文
* 本轮事件
* 本轮结果摘要

剧情正文区域规则：

* 剧情正文区域占右侧主要高度。
* 剧情正文区域独立支持上下滚动。
* 行动选项固定在右侧底部，不随剧情正文滚动。
* 不展示地点、时间、气氛等额外状态标签。
* 开场和普通轮次的完整正文返回后，由前端按每秒约 20 个字逐步播放，并以 100ms 节奏校准显示进度，保持统一且平滑的流式视觉效果。
* 开场阶段先流式展示本地背景故事，再接续 AI 生成的开场剧情。
* 如果背景故事已经展示完成但 AI 开场剧情尚未开始输出，在正文区域底部显示行内 loading。
* 普通轮次生成期间不显示默认行动选项，只显示选项准备状态；只有控制 JSON 校验通过后，才显示并解锁本轮三个行动选项。

行动选项区：

* 三个行动选项
* 选项区域保持紧凑，不抢占剧情阅读空间
* 普通轮次正文播放期间显示选项准备状态；正文播放完成但控制 JSON 尚未返回时，继续显示等待态文案，例如“主角正在做出抉择...”。
* 等待态属于选项区，不使用居中遮罩

结算区：

* 位于剧情正文下方、行动选项上方。
* 开场剧情不展示结算区。
* 剧情正文流式输出期间不展示结算区。
* 本轮控制 JSON 校验成功、前端完成规则结算后展示。
* 展示前端计算出的真实属性变化，例如 `生命 -5`、`理智 -8`、`防御 +1`。
* 展示 `ChoicePlan.settlement_hint` 作为原因短句。
* 如果攻击或防御参与了本轮事件修正，展示修正说明，例如“攻击不足，行动代价加重”“防御抵消了部分伤害”。
* 如果本轮没有属性变化，显示“属性无变化”。
* 如果本轮结算后触发失败或 100 轮完成，仍然先停留在当前剧情页展示本轮结算。
* 触发终局后，选项区不展示行动选项，改为展示“查看终幕”或“查看终局”按钮。
* 失败页和 100 轮完成页只展示终幕正文，不额外重复展示本轮结算区。

### 10.4 失败页

触发：

```text
hp <= 0
```

页面目标：

* 明确告诉玩家本局已经结束。
* 保留一点故事余味，而不是只显示“你死了”。
* 给玩家一个低阻力的再次开始入口。

布局：

```text
顶部：与游戏主页面一致的简洁顶栏
左侧：最终状态
右侧：失败剧情
底部：重新开始 / 返回首页
```

顶部区域：

* 失败标题，例如“冒险终止”。
* 显示当前轮次，例如“第 17 / 100 轮”。
* 不额外展示“生命值归零，故事在第 X 轮结束”这类系统结算副标题。

左侧最终状态：

* 生命
* 理智
* 攻击
* 防御

右侧失败剧情：

* 显示一段由统一终幕 Prompt 根据 `ending_kind` 生成的终局剧情。
* 失败剧情应承接最后一轮事件。
* 失败剧情可以有文学性，但不能改写已经发生过的关键选择。
* 文本区域支持上下滚动。
* 右侧整体结构尽量保持和游戏主页面一致，只是不再展示三个行动选项。

底部操作：

* 重新开始：回到当前世界的开局。
* 返回首页：回到世界选择页。

不做：

* 不做复活。
* 不做读取存档。
* 不做失败记录中心。
* 不做排行榜、分享图、成就弹窗。

### 10.5 最终结局页

触发：

```text
round >= 100 且 hp > 0
```

页面目标：

* 告诉玩家本局 100 轮冒险已经完成。
* 以一段完整终局文案收束故事。
* 保持和游戏主页面一致的阅读体验。
* 不再展示行动选项。

布局：

```text
顶部：与游戏主页面一致的简洁顶栏
左侧：最终状态
右侧：终局剧情
底部：重新开始 / 返回首页
```

顶部区域：

* 显示当前轮次：“第 100 / 100 轮”。
* 右侧保留模型状态。
* 不展示评分、评级、分享短句等结算化信息。

左侧最终状态：

* 生命
* 理智
* 攻击
* 防御

右侧终局剧情：

* 显示一段专门生成的终局剧情。
* 终局剧情应回收 `story_arc` 中的重要目标和伏笔。
* 文本区域支持上下滚动。
* 右侧整体结构尽量保持和游戏主页面一致，只是不再展示三个行动选项。

底部操作：

* 重新开始：回到当前世界的开局。
* 返回首页：回到世界选择页。

不做：

* 不做评分。
* 不做评级。
* 不做关键时刻回顾。
* 不做分享短句。
* 不做排行榜、成就弹窗。

---

## 11. 100 轮上下文策略

每轮传给模型：

```text
世界背景
当前 game_state
当前 hidden_state
当前 story_arc
上一轮剧情
上一轮选项
用户选择
最近 3 轮完整记录
game_history_summary
```

不把完整 100 轮原文都传给模型。

每轮结束后更新：

* 最近 3 轮完整记录
* `game_history_summary`
* `hidden_state`
* `story_arc`

摘要建议控制在：

```text
500-1200 字
```

---

## 12. 终局判断顺序

终局判断按优先级从上到下：

```text
1. hp <= 0：`death`，死亡终局
2. hp > 0 且第 100 轮且 san < 20：`collapse`，失控终局
3. 第 100 轮且 progress >= 90 且 san >= 60：`perfect`，完美完成
4. 第 100 轮且 progress >= 70：`standard`，标准完成
5. 第 100 轮且 progress 在 40-69：`bittersweet`，苦涩完成
6. 第 100 轮且 progress < 40：`incomplete`，未完成终局
```

理智低于 20 不会在第 100 轮之前单独结束游戏；它会影响选项、危险修正和剧情表现，并在终局时优先产生 `collapse`。

---

## 13. 本地 Demo 开发步骤

### 阶段 1：项目初始化

目标：

* 创建 Vite + React + TypeScript 项目。
* 配置 `.env.local`。
* 建立基础目录结构。
* 写好世界数据。

验收：

* 页面能启动。
* 世界选择页能显示 6 个世界。

### 阶段 2：核心类型与规则

目标：

* 定义 `PlayerStats`、`HiddenState`、`StoryArc`、`GameState`。
* 实现 `applyStatChanges`。
* 实现 `applyHiddenStateUpdates`。
* 实现 `applyStoryArcUpdates`。
* 实现 `resolveStatus`。

验收：

* 可以用假模型输出推进一轮状态。
* 数值会 clamp。
* HP 归零会进入失败。
* 第 100 轮会进入完成。

### 阶段 3：大模型调用

目标：

* 实现 `llmClient.ts`。
* 支持剧情文本非流式返回和前端逐步播放。
* 实现 SSE 解析。
* 拼接完整文本。
* 支持非流式低温 JSON 调用。
* 支持 `response_format: json_object`，并在接口不支持时自动降级重试。

验收：

* 输入简单 Prompt 能得到 `gpt-5.5` 返回。
* 能正确处理 `data: [DONE]`。
* 控制 JSON 调用可以关闭流式输出，并使用低温参数。

### 阶段 4：Prompt 与 Schema

目标：

* 实现开场剧情文本 Prompt。
* 实现开场控制 JSON Prompt。
* 实现每轮剧情文本 Prompt。
* 实现每轮控制 JSON Prompt。
* 实现终局 Prompt。
* 实现 JSON 修复 Prompt。
* 定义 Zod schema。

验收：

* 模型输出能被 parse。
* 控制 JSON schema 校验失败时能自动修复一次。
* JSON 修复 Prompt 会携带第一次 parse / schema 校验错误。
* 控制 JSON 修复失败不推进游戏，且保留已生成剧情。

### 阶段 5：完整游戏流程

目标：

* 世界选择。
* 开始冒险。
* 每轮三选项。
* loading 防重复点击。
* 结算展示。
* 失败页。
* 终局页。

验收：

* 可以从第 1 轮玩到多轮。
* 每轮属性变化可见。
* 每轮选择会影响下一轮 Prompt。

### 阶段 6：演示打磨

目标：

* 优化布局。
* 优化错误提示。
* 优化 loading 状态。
* 优化移动端基础适配。

验收：

* 本地演示流程稳定。
* 接口失败时不会丢失当前状态。
* 故事不会明显跑偏。

---

## 14. 风险与处理

| 风险 | 处理 |
| --- | --- |
| API Key 暴露 | 本地代理保管密钥，正式部署使用带访问控制与额度限制的后端代理 |
| 浏览器 CORS 阻止请求 | 若发生，使用 Vite 本地代理作为临时方案 |
| 控制 JSON 被截断 | 非流式短输出，限制为短控制 JSON，并设置足够 `max_tokens` |
| 控制 JSON 非法 | 自动修复一次 |
| 控制 JSON 字段缺失 | schema 校验失败，进入修复 |
| 长线剧情漂移 | 使用 `story_arc` 约束主线和伏笔 |
| 100 轮上下文过长 | 最近 3 轮 + 历史摘要 + hidden_state + story_arc |
| 用户重复点击 | loading 锁定选项按钮 |
| 控制 JSON 非流式接口失败 | 自动去掉 `response_format` 降级重试；仍失败则保留当前剧情并提示重试 |

---

## 15. 本地运行命令

初始化：

```bash
npm create vite@latest ai-text-adventure-demo -- --template react-ts
cd ai-text-adventure-demo
npm install
npm install zod lucide-react
```

运行：

```bash
npm run dev
```

浏览器访问：

```text
http://localhost:5173
```

---

## 16. 本地 Demo 的边界

本地 Demo 不做：

* 用户登录
* 云端数据库
* 云端存档
* 冒险记录中心
* 成就系统
* 设置页
* 冒险者档案
* 角色等级成长系统
* 排行榜
* 分享图
* 多人游戏
* 后台管理

本地 Demo 保留：

* 100 轮
* 完整世界选择
* 完整三选项流程
* 完整属性系统
* 完整理智机制
* 完整事件类型
* 完整战斗结算展示
* 完整突发事件展示
* 完整隐藏状态
* 完整 `story_arc`
* 完整终局判断
* 完整控制 JSON 校验与修复

---

## 17. 推荐实现原则

1. 先用假数据跑通 UI，再接大模型。
2. 模型输出永远不直接覆盖最终状态。
3. 所有数值变化必须经过规则层。
4. 所有模型 JSON 必须经过 schema。
5. 每轮失败都不能推进游戏。
6. UI 不解释玩法规则太多，优先让玩家直接开始。
7. 保持本地 Demo 简单，但不要牺牲核心玩法完整性。
