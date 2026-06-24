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
