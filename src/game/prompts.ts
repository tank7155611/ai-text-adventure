import { EVENT_TYPES } from './types';
import type { GameState, PlayerStats, Story, WorldDefinition } from './types';

const jsonOnlyRule = `只返回一个合法 JSON 对象。禁止 Markdown、解释、代码块、前后缀文本。第一个字符必须是 {，最后一个字符必须是 }。所有 key 和字符串 value 必须使用英文双引号。不要使用注释、尾随逗号、undefined、NaN。`;

const storyTextRule = `只返回纯文本，不要 JSON，不要 Markdown，不要代码块。
输出格式必须是：
标题：2-40字标题

正文：
300-700字中文剧情正文，2-5段。`;

const statImpactValues = `"none", "minor_loss", "medium_loss", "major_loss", "minor_gain", "medium_gain", "major_gain"`;
const eventTypeValues = EVENT_TYPES.map((type) => `"${type}"`).join(', ');

const eventTypeGuide = `事件类型参考：
- normal: 普通推进，无明显风险或收益
- exploration: 探索新区域、进入未知地点
- investigation: 调查线索、验证推断
- social: 对话、关系变化、获取态度
- negotiation: 交易、谈判、说服、交换条件
- combat: 正面战斗
- ambush: 伏击、突袭、突然受袭
- escape: 逃脱、追逐、摆脱危险
- stealth: 潜行、绕行、避开正面冲突
- hazard: 环境危险、坍塌、毒雾、压力、风暴等
- trap: 陷阱、机关、封锁、误触装置
- puzzle: 解谜、破解、机关推演
- discovery: 发现重要线索或新事实
- twist: 反转、真相偏移、可信信息被推翻
- rest: 短暂休整、喘息、整理状态
- recovery: 治疗、恢复、稳定理智
- training: 训练、领悟、熟练度提升
- upgrade: 武器、防具、工具、护符或装备升级
- resource: 获得或消耗补给、材料、能量
- ally: 获得同伴、支援、临时帮助
- sacrifice: 付出代价换取推进
- ritual: 仪式、魔法、世界机制或特殊规则触发`;

const statRhythmGuide = `属性节奏规则：
- 大多数轮次只影响 0-1 个属性，重大事件最多影响 2 个属性。
- 不要连续多轮只使用 san loss；除非剧情明确持续精神污染，否则应在 hp、san、atk、def、无变化之间形成变化。
- combat、ambush、trap、hazard、escape 更容易影响生命或防御。
- investigation、discovery、twist、ritual 才更容易影响理智，但不代表每次都要降低理智。
- rest、recovery 可以恢复生命或理智。
- training 可以提升攻击。
- upgrade 可以提升攻击或防御。
- resource、ally、social、negotiation 可以无属性变化，也可以带来生命恢复、理智恢复、防御提升或后续优势。
- sacrifice 可以用生命或理智损失换取主线推进。`;

const choiceRhythmGuide = `选项方向规则：
- 三个选项都必须承接当前剧情最后局面。
- A 通常偏主动推进、冒险、正面处理。
- B 通常偏谨慎调查、防御、观察、验证。
- C 通常偏恢复、准备、绕行、交涉、利用资源或寻找支援。
- 不要让三个选项都只是调查异常、靠近异常或凝视异常。`;

const controlSchemaDescription = `字段契约：
- schema_version: 必须精确等于 "round_control_v1"
- resolution.summary: 2-300 字中文短句
- resolution.event_type: 只能是 ${eventTypeValues} 其中一个
- stat_effects.hp/san/atk/def: 每个字段只能是 ${statImpactValues} 其中一个
- stat_effects.reason: 2-160 字中文短句，不能包含具体数字
- hidden_state_updates: 必须是对象；没有更新时使用空数组和 progress: 0
- hidden_state_updates.progress: 整数，范围 -10 到 20
- hidden_state_updates.key_clues/allies/injuries/flags: 字符串数组，最多 5 项
- hidden_state_updates.major_choices: 字符串数组，最多 5 项
- story_arc_updates: 对象；必须包含 current_thread、unresolved_hooks、tension_level、finale_direction
- story_arc_updates.tension_level: 整数，范围 1 到 5
- choices: 必须正好 3 项，id 必须依次为 "A", "B", "C"，text 为 2-80 字中文行动`;

const openingControlExample = `{
  "schema_version": "round_control_v1",
  "resolution": {
    "summary": "主角抵达故事开端，局势尚未造成明确损耗。",
    "event_type": "normal"
  },
  "stat_effects": {
    "hp": "none",
    "san": "none",
    "atk": "none",
    "def": "none",
    "reason": "开场仅建立局面，尚未产生属性影响"
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
    "current_thread": "确认眼前异常的来源",
    "unresolved_hooks": ["异常源头尚未查明"],
    "tension_level": 1,
    "finale_direction": "围绕核心悬念逐步接近真相"
  },
  "choices": [
    { "id": "A", "text": "主动接近最可疑的目标" },
    { "id": "B", "text": "谨慎观察周围的异常迹象" },
    { "id": "C", "text": "先寻找可用资源和安全退路" }
  ]
}`;

const roundControlExample = `{
  "schema_version": "round_control_v1",
  "resolution": {
    "summary": "主角利用现有材料完成临时加固，为继续深入争取了余地。",
    "event_type": "upgrade"
  },
  "stat_effects": {
    "hp": "none",
    "san": "none",
    "atk": "none",
    "def": "minor_gain",
    "reason": "临时加固让主角面对下一次危险时更有把握"
  },
  "hidden_state_updates": {
    "progress": 1,
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
}`;

const finaleSchemaDescription = `字段契约：
- schema_version: 必须精确等于 "failure_finale_v1" 或 "completion_finale_v1"
- title: 2-40 字中文标题
- finale_story: 80-2600 字中文终局正文`;

const finaleOutputExample = `{
  "schema_version": "failure_finale_v1",
  "title": "终幕标题",
  "finale_story": "这里写终局正文，承接最后一轮发生的事件，不生成行动选项。"
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

function storyContext(story: Story) {
  return `本轮标题：${story.title}
本轮正文：
${story.body}`;
}

export function buildOpeningStoryPrompt(world: WorldDefinition) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你只负责生成第 1 轮开场剧情文本，不负责选项、结算或 JSON。${storyTextRule}`
    },
    {
      role: 'user' as const,
      content: `为本地 Demo 生成第 1 轮开场剧情。

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
1. 只写已经发生的开场局面，不生成行动选项。
2. 不要出现属性变化、结算、系统提示、JSON 字段。
3. 不要替玩家做出后续选择。
4. 正文必须给玩家留下明确但开放的行动空间。`
    }
  ];
}

export function buildRoundStoryPrompt(game: GameState, choiceText: string) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你只负责根据玩家选择生成本轮剧情文本，不负责选项、结算或 JSON。${storyTextRule}`
    },
    {
      role: 'user' as const,
      content: `根据玩家选择推进一轮冒险，只生成本轮已经发生的剧情。

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

规则：
1. 只写本轮实际发生的剧情，不生成下一轮行动选项。
2. 不要写属性变化、结算摘要、JSON 字段或系统状态。
3. 不要直接宣布 failed、completed、game_over 或游戏结束。
4. 剧情必须承接玩家选择和 story_arc，不要跳到无关主线。
5. 本轮事件不要总是精神污染或异常凝视；可以包含探索、交涉、战斗、陷阱、休整、治疗、训练、装备加固、获得资源、同伴帮助等不同类型。
6. 如果玩家选择偏谨慎或准备，可以让剧情出现恢复、加固、绕行、资源利用或信息整理，而不是必然受损。
7. 正文最后要停在一个适合生成三选项的局面。`
    }
  ];
}

export function buildOpeningControlPrompt(world: WorldDefinition, story: Story) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的控制数据整理器。你只根据已生成剧情返回选项、结算和状态更新 JSON，不能新增剧情事实。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `根据已生成的第 1 轮开场剧情，生成控制 JSON。

世界：${world.name}
基调：${world.tone}
世界概览：${world.overview}
世界背景：${world.premise}
世界局势：${world.worldDetail}
核心悬念：${world.conflict}
玩家身份：${world.playerIdentity}
主目标：${world.mainGoal}
当前剧情线：${world.initialThread}

${storyContext(story)}

规则：
1. 这是第 1 轮，不要造成属性变化，stat_effects 的 hp/san/atk/def 全部为 "none"。
2. 只允许属性字段 hp、san、atk、def。
3. 不要返回 status、failed、completed、game_over、等级、金币、背包、声望、地点/时间/气氛状态。
4. choices 必须正好 3 个，id 为 A/B/C。
5. choices 必须承接本轮正文最后的局面，不能新增正文中没有出现的剧情事实。
6. stat_effects.reason 要基于正文中已发生的事件，不能包含具体数字。
7. 必须返回 hidden_state_updates 对象；没有更新时用空数组和 progress: 0。
8. 必须返回 story_arc_updates 对象；内容要延续世界主线，不要发明正文外的新事件。
9. 输出必须符合字段契约，并参考示例格式；不要照抄示例内容，要按本轮剧情填写。

${eventTypeGuide}

${choiceRhythmGuide}

字段契约：
${controlSchemaDescription}

合法示例：
${openingControlExample}`
    }
  ];
}

export function buildRoundControlPrompt(game: GameState, choiceText: string, story: Story) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的控制数据整理器。你只根据已生成剧情返回选项、结算和状态更新 JSON，不能新增剧情事实。最终数值由前端规则层计算。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `根据已生成的本轮剧情，生成控制 JSON。

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

${storyContext(story)}

硬性规则：
1. 只允许属性字段 hp、san、atk、def。不要出现资源、金币、背包、体力、声望、等级。
2. AI 不能返回 status、failed、completed、game_over，也不能直接宣布游戏结束。
3. stat_effects 只能使用枚举标签，不能返回任何具体加减数字；前端会把标签换算成真实数值、clamp 并判断 hp <= 0。
4. 如果正文发生危险或战斗，可以让 hp/san 使用 loss 标签；如果正文明确获得成长，可以让 atk/def 使用 gain 标签。轻微影响用 minor，中等影响用 medium，重大影响才用 major。
5. choices 必须正好 3 个，id 为 A/B/C；除非前端之后判断结束，否则这些选项会用于下一轮。
6. choices 必须承接本轮正文最后的局面，不能新增正文中没有出现的剧情事实。
7. hidden_state_updates 和 story_arc_updates 只能提取或延续正文已经发生的信息，不能发明新线索、新道具或新角色。
8. story_arc_updates 应帮助 100 轮长线不跑偏。
9. stat_effects.reason 是一条结算原因短句，要和 story.body 发生的事件一致，不要包含具体数值。
10. 必须返回 hidden_state_updates 对象；没有更新时用空数组和 progress: 0。
11. 必须返回 story_arc_updates 对象；内容要延续主线，不要发明正文外的新事件。
12. 根据正文选择最贴近的 event_type，不要总是使用 discovery、twist 或 ritual。
13. 输出必须符合字段契约，并参考示例格式；不要照抄示例内容，要按本轮剧情填写。

${eventTypeGuide}

${statRhythmGuide}

${choiceRhythmGuide}

字段契约：
${controlSchemaDescription}

合法示例：
${roundControlExample}`
    }
  ];
}

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
