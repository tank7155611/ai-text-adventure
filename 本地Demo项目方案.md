# AI 文字冒险游戏本地 Demo 项目方案

## 1. 目标

本方案用于在本地快速做出一个可演示的 Web Demo，完整保留 `需求.md` 中规划的核心功能，不做玩法阉割。

Demo 目标：

1. 支持完整 100 轮游戏流程。
2. 支持世界选择、世界详情、开场剧情、每轮三选项、属性面板、事件结算、终局生成。
3. 使用 OpenAI 兼容接口调用大模型。
4. 使用 `gpt-5.5`，并采用 `stream: true` 流式响应。
5. 前端负责全部游戏状态计算、JSON 校验、隐藏状态合并、`story_arc` 维护和 UI 展示。
6. 不做账号系统，不做云端存档，不做数据库。
7. 不加入服务器业务逻辑；本地演示阶段优先纯前端实现。

说明：

* 本地 Demo 可以把 API Key 放在 `.env.local` 中读取，但这仍然会暴露在浏览器运行环境里，只适合本机演示。
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
STREAM=true
ENDPOINT=/chat/completions
```

`.env.local` 示例：

```env
VITE_LLM_BASE_URL=https://openrouter.chipltech.com/v1
VITE_LLM_MODEL=gpt-5.5
VITE_LLM_API_KEY=请填写你自己的 API Key
```

注意：

1. 不要把真实 API Key 写进代码。
2. 不要提交 `.env.local`。
3. 本接口经测试需要 `stream: true`，非流式请求可能返回 `400 bad_response_status_code`。

请求格式：

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

返回格式是 SSE：

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

---

## 4. 项目结构

建议目录：

```text
ai-text-adventure-demo/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  .env.local
  .gitignore
  src/
    main.tsx
    App.tsx
    styles/
      global.css
      theme.css
    data/
      worlds.ts
    types/
      game.ts
      model.ts
    schemas/
      roundOutputSchema.ts
      endingOutputSchema.ts
    prompts/
      buildOpeningPrompt.ts
      buildRoundPrompt.ts
      buildFailureFinalePrompt.ts
      buildCompletionFinalePrompt.ts
      buildJsonRepairPrompt.ts
    services/
      llmClient.ts
      streamParser.ts
      jsonRepair.ts
    game/
      initialState.ts
      rules.ts
      applyStatChanges.ts
      applyHiddenStateUpdates.ts
      applyStoryArcUpdates.ts
      resolveStatus.ts
      historySummary.ts
      endingRules.ts
    components/
      WorldSelect.tsx
      WorldDetailModal.tsx
      GameLayout.tsx
      StoryPanel.tsx
      ChoiceList.tsx
      PlayerPanel.tsx
      ResolutionPanel.tsx
      EndingView.tsx
      ErrorBanner.tsx
      LoadingOverlay.tsx
    hooks/
      useGameController.ts
```

---

## 5. 核心架构

本地 Demo 采用前端单体架构：

```text
React UI
  ↓ 用户点击选项
Game Controller
  ↓ 组装 Prompt
LLM Client
  ↓ stream: true
OpenAI 兼容接口
  ↓ SSE 文本流
Stream Parser
  ↓ 拼接完整 JSON 字符串
Zod Schema 校验
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
| UI 组件 | 展示世界、剧情、属性、选项、结算、结局 |
| useGameController | 控制游戏流程 |
| prompts | 构建开场、每轮、终局、JSON 修复 Prompt |
| llmClient | 调用 OpenAI 兼容接口 |
| streamParser | 解析 SSE 流 |
| schemas | 校验模型输出 |
| game/rules | 计算属性、状态、隐藏状态、叙事轨道和终局 |

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
  round: number;
  status: GameStatus;
  world_id: string;
  player_stats: PlayerStats;
  hidden_state: HiddenState;
  story_arc: StoryArc;
  current_story: Story;
  choices: Choice[];
  last_settlement?: RoundSettlement;
};
```

---

## 7. 大模型输出设计

大模型不直接返回最终 `player_stats`，也不直接返回具体加减数字。模型只返回本轮属性影响标签，前端规则层再把标签换算为真实 `stat_changes`。

每轮输出：

```ts
type StatImpact =
  | 'none'
  | 'minor_loss'
  | 'medium_loss'
  | 'major_loss'
  | 'minor_gain'
  | 'medium_gain'
  | 'major_gain';

type StatEffects = {
  hp: StatImpact;
  san: StatImpact;
  atk: StatImpact;
  def: StatImpact;
  reason: string;
};

type ModelRoundOutput = {
  schema_version: 'round_event_v1';
  story: Story;
  resolution: Resolution;
  stat_effects: StatEffects;
  hidden_state_updates: HiddenStateUpdates;
  story_arc_updates?: StoryArcUpdates;
  choices: Choice[];
};
```

关键规则：

1. 模型不返回完整 `player_stats`。
2. 模型不返回完整 `hidden_state`。
3. 模型不返回最终 `status`。
4. 前端规则层负责把 `stat_effects` 换算成真实属性变化，并计算最终属性。
5. 前端规则层负责合并隐藏状态。
6. 前端规则层负责判断 `playing / failed / completed`。
7. `stat_effects.reason` 用于轻量结算区展示原因短句，不能包含具体数值。
8. 每轮剧情正文建议控制在 300-700 个中文字符，避免模型只写完正文就被截断，导致后续选项和 JSON 字段缺失。
9. 接口调用应设置足够的输出上限，例如 `max_tokens: 4096`。

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

属性变化不由模型直接给数字，而是由前端根据 `stat_effects` 映射：

```ts
const STAT_EFFECT_VALUES = {
  hp: {
    none: 0,
    minor_loss: -5,
    medium_loss: -10,
    major_loss: -18,
    minor_gain: 5,
    medium_gain: 10,
    major_gain: 15
  },
  san: {
    none: 0,
    minor_loss: -4,
    medium_loss: -8,
    major_loss: -14,
    minor_gain: 4,
    medium_gain: 8,
    major_gain: 12
  },
  atk: {
    none: 0,
    minor_loss: -1,
    medium_loss: -2,
    major_loss: -3,
    minor_gain: 1,
    medium_gain: 2,
    major_gain: 3
  },
  def: {
    none: 0,
    minor_loss: -1,
    medium_loss: -2,
    major_loss: -3,
    minor_gain: 1,
    medium_gain: 2,
    major_gain: 3
  }
};
```

这样 AI 负责判断“轻微受伤 / 中等压力 / 小幅成长”，前端负责稳定计算真实数值。

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
    progress: clamp(current.progress + (updates.progress_change ?? 0), 0, 100),
    key_clues: unique([...current.key_clues, ...(updates.key_clues_added ?? [])]),
    allies: unique([...current.allies, ...(updates.allies_added ?? [])]),
    injuries: unique([...current.injuries, ...(updates.injuries_added ?? [])]),
    flags: unique([...current.flags, ...(updates.flags_added ?? [])]),
    major_choices: unique([...current.major_choices, ...(updates.major_choices_added ?? [])])
  };
}
```

### 8.3 叙事轨道合并

```ts
function applyStoryArcUpdates(
  current: StoryArc,
  updates?: StoryArcUpdates
): StoryArc {
  if (!updates) return current;

  const resolved = updates.unresolved_hooks_resolved ?? [];
  const remainingHooks = current.unresolved_hooks.filter(
    (hook) => !resolved.includes(hook)
  );

  return {
    main_goal: updates.main_goal || current.main_goal,
    current_thread: updates.current_thread || current.current_thread,
    unresolved_hooks: unique([
      ...remainingHooks,
      ...(updates.unresolved_hooks_added ?? [])
    ]).slice(-8),
    tension_level: clamp(
      current.tension_level + (updates.tension_level_change ?? 0),
      1,
      5
    ),
    finale_direction: updates.finale_direction || current.finale_direction
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

### 8.5 失败终幕生成流程

失败不由 AI 直接决定，必须由前端规则层判断。

流程：

```text
玩家点击选项
↓
AI 返回本轮剧情、结算描述、stat_effects
↓
前端规则层把 stat_effects 映射为 stat_changes，并计算 next_player_stats
↓
resolveStatus(round, next_player_stats)
↓
如果 hp <= 0，状态进入 failed
↓
前端再发起一次失败终幕 Prompt
↓
AI 只生成 failure_story
↓
展示失败页
```

关键规则：

* AI 每轮不能直接返回 `status: failed` 或 `game_over: true`。
* AI 只能返回本轮属性影响标签，例如 `stat_effects.hp = "medium_loss"`。
* AI 不能返回具体加减数值，真实 `stat_changes` 由前端规则层计算。
* 前端负责 clamp 数值和判断 `hp <= 0`。
* 只有当前端已经判定 `failed` 后，才允许调用失败终幕 Prompt。
* 失败终幕 Prompt 只生成失败剧情，不再生成选项。
* 失败终幕剧情必须承接最后一轮事件，不能改写玩家已做过的关键选择。
* 如果失败终幕生成失败，则使用最后一轮剧情和结算描述作为失败页兜底文案。

失败终幕输出：

```ts
type FailureFinaleOutput = {
  schema_version: 'failure_finale_v1';
  title: string;
  failure_story: string;
};
```

---

## 9. JSON 校验与修复

模型返回内容必须先经过：

```text
SSE 拼接
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

修复失败时：

* 不推进轮次。
* 不扣属性。
* 不更新 `hidden_state`。
* 不更新 `story_arc`。
* 在选项区域显示错误态和“重新生成本轮”按钮。
* 点击“重新生成本轮”时，使用本轮开始前的 `game_state` 和同一个玩家选择重新调用本轮 Prompt。
* 不建议只重新修复同一份坏 JSON，因为自动修复已经失败，继续修同一段内容成功率低，且容易和已展示剧情不一致。

### 9.1 Prompt 与 Schema 实际实现

本节内容必须和当前 Demo 源码保持一致。开发时可以直接按本节拆分为：

```text
src/game/prompts.ts
src/game/schemas.ts
```

如果后续调整 Prompt 或 schema，需要同步更新本节，避免文档和实际 Demo 脱节。

#### 9.1.1 Prompt 公共结构

```ts
import type { GameState, PlayerStats, WorldDefinition } from './types';

const jsonOnlyRule = `只返回一个合法 JSON 对象，不要 Markdown，不要解释，不要代码块。`;

const roundSchemaDescription = `{
  "schema_version": "round_event_v1",
  "story": { "title": "2-40字标题", "body": "本轮剧情正文，中文，300-700字，2-5段" },
  "resolution": { "summary": "本轮结果摘要", "event_type": "normal|combat|discovery|danger|rest|twist" },
  "stat_effects": {
    "hp": "none|minor_loss|medium_loss|major_loss|minor_gain|medium_gain|major_gain",
    "san": "none|minor_loss|medium_loss|major_loss|minor_gain|medium_gain|major_gain",
    "atk": "none|minor_loss|medium_loss|major_loss|minor_gain|medium_gain|major_gain",
    "def": "none|minor_loss|medium_loss|major_loss|minor_gain|medium_gain|major_gain",
    "reason": "用于结算区展示的原因短句，不能包含具体数字"
  },
  "hidden_state_updates": {
    "progress": 0,
    "key_clues": [],
    "allies": [],
    "injuries": [],
    "flags": [],
    "major_choices": []
  },
  "story_arc_updates": {
    "main_goal": "可选",
    "current_thread": "可选",
    "unresolved_hooks": [],
    "tension_level": 1,
    "finale_direction": "可选"
  },
  "choices": [
    { "id": "A", "text": "行动选项" },
    { "id": "B", "text": "行动选项" },
    { "id": "C", "text": "行动选项" }
  ]
}`;

function statsText(stats: PlayerStats) {
  return `生命 ${stats.hp}/100，理智 ${stats.san}/100，攻击 ${stats.atk}，防御 ${stats.def}`;
}

function stateContext(game: GameState) {
  return `当前轮次：第 ${game.round} / 100 轮
当前属性：${statsText(game.player_stats)}
hidden_state：${JSON.stringify(game.hidden_state)}
story_arc：${JSON.stringify(game.story_arc)}
最近3轮：${JSON.stringify(game.recent_history)}
历史摘要：${game.game_history_summary || '暂无'}`;
}
```

#### 9.1.2 开场 Prompt

```ts
export function buildOpeningPrompt(world: WorldDefinition) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你负责生成剧情、选项和本轮属性影响标签，但不能决定最终状态或具体数值。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `为本地 Demo 生成第 1 轮开场剧情和三个行动选项。

世界：${world.name}
基调：${world.tone}
世界概览：${world.overview}
世界背景：${world.premise}
世界局势：${world.worldDetail}
核心悬念：${world.conflict}
玩家身份：${world.playerIdentity}
主目标：${world.mainGoal}
当前剧情线：${world.initialThread}

规则：
1. 这是第 1 轮，不要造成属性变化，stat_effects 的 hp/san/atk/def 全部为 "none"。
2. 只允许属性字段 hp、san、atk、def。
3. 不要返回 status、game_over、等级、金币、背包、声望、地点/时间/气氛状态。
4. choices 必须正好 3 个，id 为 A/B/C。
5. story.body 控制在 300-700 个中文字符，最多 5 段，必须给后续 JSON 字段留下输出空间。
6. 输出必须符合这个 JSON 结构：
${roundSchemaDescription}`
    }
  ];
}
```

#### 9.1.3 每轮 Prompt

```ts
export function buildRoundPrompt(game: GameState, choiceText: string) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你只生成本轮剧情、结算描述、属性影响标签、隐藏状态更新、叙事轨道更新和下一轮三个行动选项。最终数值由前端规则层计算。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `根据玩家选择推进一轮冒险。

世界：${game.world.name}
世界概览：${game.world.overview}
世界背景：${game.world.premise}
世界局势：${game.world.worldDetail}
核心悬念：${game.world.conflict}
玩家身份：${game.world.playerIdentity}
${stateContext(game)}

上一轮标题：${game.current_story.title}
上一轮正文：${game.current_story.body}
玩家选择：${choiceText}

硬性规则：
1. 只允许属性字段 hp、san、atk、def。不要出现资源、金币、背包、体力、声望、等级。
2. AI 不能返回 status、failed、completed、game_over，也不能直接宣布游戏结束。
3. stat_effects 只能使用枚举标签，不能返回任何具体加减数字；前端会把标签换算成真实数值、clamp 并判断 hp <= 0。
4. 如果发生危险或战斗，可以让 hp/san 使用 loss 标签；如果获得成长，可以让 atk/def 使用 gain 标签。轻微影响用 minor，中等影响用 medium，重大影响才用 major。
5. choices 必须正好 3 个，id 为 A/B/C；除非前端之后判断结束，否则这些选项会用于下一轮。
6. story_arc_updates 应帮助 100 轮长线不跑偏。
7. stat_effects.reason 是一条结算原因短句，要和 story.body 发生的事件一致，不要包含具体数值。
8. story.body 控制在 300-700 个中文字符，最多 5 段，必须给选项和状态字段留下输出空间。
9. 输出必须符合这个 JSON 结构：
${roundSchemaDescription}`
    }
  ];
}
```

#### 9.1.4 失败终局 Prompt

```ts
export function buildFailureFinalePrompt(game: GameState) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的终幕叙事引擎。前端已经判定失败，你只生成失败终幕文案。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `为失败页生成终幕剧情。

世界：${game.world.name}
世界概览：${game.world.overview}
世界背景：${game.world.premise}
世界局势：${game.world.worldDetail}
核心悬念：${game.world.conflict}
最终属性：${statsText(game.player_stats)}
当前轮次：第 ${game.round} / 100 轮
最后剧情：${game.current_story.title}
${game.current_story.body}
story_arc：${JSON.stringify(game.story_arc)}
最近3轮：${JSON.stringify(game.recent_history)}

规则：
1. 前端已经判定 hp <= 0，但文案里不要出现系统判定句。
2. 不要生成选择按钮，不要生成下一步行动。
3. 失败剧情要承接最后一轮事件，不要改写玩家已做过的关键选择。
4. 输出结构：
{
  "schema_version": "failure_finale_v1",
  "title": "终幕标题",
  "finale_story": "失败终幕剧情，中文，2-5段"
}`
    }
  ];
}
```

#### 9.1.5 100 轮完成终局 Prompt

```ts
export function buildCompletionFinalePrompt(game: GameState) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的终幕叙事引擎。前端已经判定到达第100轮，你只生成完成终局文案。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `为 100 轮完成页生成终局剧情。

世界：${game.world.name}
世界概览：${game.world.overview}
世界背景：${game.world.premise}
世界局势：${game.world.worldDetail}
核心悬念：${game.world.conflict}
最终属性：${statsText(game.player_stats)}
hidden_state：${JSON.stringify(game.hidden_state)}
story_arc：${JSON.stringify(game.story_arc)}
最近3轮：${JSON.stringify(game.recent_history)}
历史摘要：${game.game_history_summary || '暂无'}

规则：
1. 不要生成评分、评级、分享短句、关键回顾。
2. 不要生成选择按钮，不要生成下一步行动。
3. 终局剧情要回收 story_arc 中的重要目标和伏笔。
4. 输出结构：
{
  "schema_version": "completion_finale_v1",
  "title": "终局标题",
  "finale_story": "完成终局剧情，中文，3-6段"
}`
    }
  ];
}
```

#### 9.1.6 JSON 修复 Prompt

```ts
export function buildJsonRepairPrompt(rawText: string, schemaName: 'round' | 'finale') {
  const schema =
    schemaName === 'round'
      ? roundSchemaDescription
      : `{
  "schema_version": "failure_finale_v1 或 completion_finale_v1",
  "title": "标题",
  "finale_story": "终幕剧情正文"
}`;

  return [
    {
      role: 'system' as const,
      content: `你是 JSON 修复器。只能修复结构和字段，不要改写剧情含义。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `把下面内容修复为合法 JSON，并严格符合结构。不要添加解释。

目标结构：
${schema}

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

const statImpactSchema = z.enum([
  'none',
  'minor_loss',
  'medium_loss',
  'major_loss',
  'minor_gain',
  'medium_gain',
  'major_gain'
]);

const statEffectsSchema = z
  .object({
    hp: statImpactSchema,
    san: statImpactSchema,
    atk: statImpactSchema,
    def: statImpactSchema,
    reason: z.string().min(2).max(160)
  })
  .strict();

const choiceSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  text: z.string().min(2).max(80)
});

export const roundOutputSchema = z
  .object({
    schema_version: z.literal('round_event_v1'),
    story: z.object({
      title: z.string().min(2).max(40),
      body: z.string().min(40).max(2400)
    }),
    resolution: z.object({
      summary: z.string().min(2).max(300),
      event_type: z.enum(['normal', 'combat', 'discovery', 'danger', 'rest', 'twist'])
    }),
    stat_effects: statEffectsSchema,
    hidden_state_updates: z
      .object({
        progress: z.number().int().min(-10).max(20).optional(),
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
    schema_version: z.union([
      z.literal('failure_finale_v1'),
      z.literal('completion_finale_v1')
    ]),
    title: z.string().min(2).max(40),
    finale_story: z.string().min(80).max(2600)
  })
  .strict();

export type RoundOutputSchema = z.infer<typeof roundOutputSchema>;
export type FinaleOutputSchema = z.infer<typeof finaleOutputSchema>;
```

#### 9.1.8 校验与修复实际流程

```ts
async function parseWithRepair<T>(
  rawText: string,
  schema: z.ZodType<T>,
  repairKind: 'round' | 'finale',
  signal?: AbortSignal
) {
  try {
    const first = schema.safeParse(parseJsonObject(rawText));
    if (first.success) return first.data;
  } catch {
    // Parse failures still get one structured repair attempt.
  }

  const repaired = await chatCompletion(buildJsonRepairPrompt(rawText, repairKind), signal);
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
* UI 在选项区显示错误态和“重新生成本轮”按钮。

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
* 开场生成和每轮生成期间，剧情正文应使用流式输出逐步展示。
* 生成期间不显示默认行动选项。
* 只有模型完整返回、JSON 校验通过并完成状态计算后，才显示本轮三个行动选项。

行动选项区：

* 三个行动选项
* 选项区域保持紧凑，不抢占剧情阅读空间
* 当剧情正文流式输出完成，但选项尚未生成完成时，在选项区显示等待态文案，例如“主角正在做出抉择...”
* 剧情正文仍在流式输出时，不显示选项区等待态，避免干扰阅读。
* 等待态属于选项区，不使用居中遮罩

结算区：

* 位于剧情正文下方、行动选项上方。
* 开场剧情不展示结算区。
* 剧情正文流式输出期间不展示结算区。
* 本轮 JSON 校验成功、前端完成规则结算后展示。
* 展示前端计算出的真实属性变化，例如 `生命 -5`、`理智 -8`、`防御 +1`。
* 展示 `stat_effects.reason` 作为原因短句。
* 如果本轮没有属性变化，显示“属性无变化”。
* 失败页和 100 轮完成页不额外展示本轮结算区，只展示终幕正文。

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

* 显示一段由失败终幕 Prompt 专门生成的失败剧情。
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
1. hp <= 0：失败结局
2. hp > 0 且 san < 20：迷失结局
3. hp > 0 且 progress >= 90 且 san >= 60 且关键线索充足：完美结局
4. hp > 0 且 progress >= 70：普通结局
5. hp > 0 且 progress 在 40-69：遗憾结局
6. hp > 0 且 progress < 40：低完成度遗憾结局
```

如果 `san < 20` 但 `progress >= 90` 且关键线索充足，可以生成带代价感的特殊完成结局，但必须体现理智崩溃的影响。

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
* 支持 `stream: true`。
* 实现 SSE 解析。
* 拼接完整文本。

验收：

* 输入简单 Prompt 能得到 `gpt-5.5` 返回。
* 能正确处理 `data: [DONE]`。

### 阶段 4：Prompt 与 Schema

目标：

* 实现开场 Prompt。
* 实现每轮 Prompt。
* 实现终局 Prompt。
* 实现 JSON 修复 Prompt。
* 定义 Zod schema。

验收：

* 模型输出能被 parse。
* schema 校验失败时能自动修复一次。
* 修复失败不推进游戏。

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
| API Key 暴露 | 本地 Demo 可接受，正式部署必须改后端代理 |
| 浏览器 CORS 阻止请求 | 若发生，使用 Vite 本地代理作为临时方案 |
| 流式 JSON 被截断 | 只在 `[DONE]` 后 parse |
| 模型输出非 JSON | 自动修复一次 |
| 模型返回字段缺失 | schema 校验失败，进入修复 |
| 长线剧情漂移 | 使用 `story_arc` 约束主线和伏笔 |
| 100 轮上下文过长 | 最近 3 轮 + 历史摘要 + hidden_state + story_arc |
| 用户重复点击 | loading 锁定选项按钮 |
| 非流式接口失败 | 固定使用 `stream: true` |

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
* 完整 JSON 校验与修复

---

## 17. 推荐实现原则

1. 先用假数据跑通 UI，再接大模型。
2. 模型输出永远不直接覆盖最终状态。
3. 所有数值变化必须经过规则层。
4. 所有模型 JSON 必须经过 schema。
5. 每轮失败都不能推进游戏。
6. UI 不解释玩法规则太多，优先让玩家直接开始。
7. 保持本地 Demo 简单，但不要牺牲核心玩法完整性。
