import { planNextChoices, previewChoiceResult } from './rules';
import { EVENT_TYPES } from './types';
import type { Choice, EndingContext, EndingKind, GameState, Language, PlayerStats, Story, WorldDefinition } from './types';

const jsonOnlyRule = `只返回一个合法 JSON 对象。禁止 Markdown、解释、代码块、前后缀文本。第一个字符必须是 {，最后一个字符必须是 }。所有 key 和字符串 value 必须使用英文双引号。不要使用注释、尾随逗号、undefined、NaN。`;

function storyTextRule(language: Language) {
  return language === 'en'
    ? `Return plain text only. Do not return JSON, Markdown, or code blocks.
Required format:
Title: 2-40 English words

Body:
300-700 English words, 2-5 paragraphs.`
    : `只返回纯文本，不要 JSON，不要 Markdown，不要代码块。
输出格式必须是：
标题：2-40字标题

正文：
300-700字中文剧情正文，2-5段。`;
}

function outputLanguageRule(language: Language) {
  return language === 'en'
    ? 'All player-facing generated strings must be in English, including title, body, summary, choices, story_arc fields, and finale_story.'
    : '所有面向玩家生成的文本必须使用中文，包括标题、正文、摘要、选项、story_arc 字段和终局正文。';
}

function worldStyleRule(world: WorldDefinition) {
  if (world.id !== 'xianxia') return '';

  return world.language === 'en'
    ? `World-specific style rule:
This xianxia world is hot-blooded cultivation fantasy, not a mystery puzzle, but the crisis must escalate gradually.
- Early game: focus on outer-court training, low-level duels, patrol missions, herb escorts, minor ambushes, resource disputes, and early sword-bone awakening. Do not start with sect collapse, stolen soul flame, Hundred Sects pressure, or final-boss enemies.
- Mid game: allow route branching. The protagonist may stay in the sect, be framed or defeated and flee, be hunted by rival forces, enter a secret realm by accident or choice, seek allies, or grow through pursuit and trials.
- Late game: gradually pull every route back toward the sect crisis. The rival sect infiltration should expand into soul-flame theft, mountain ward collapse, elder injuries, and the sect waiting for the protagonist's return or counterattack.
- Finale direction: the protagonist can save the sect directly, return with secret-realm power, strike the enemy from outside, rescue the disciples rather than the old order, or fail and become a hunted legend.
Prioritize challenges, arena fights, sword-bone tempering, breakthroughs, direct clashes, protection, pursuit, secret-realm trials, and defying fate. Avoid making the main action revolve around decoding clues, quiet investigation, inscriptions, or passive mystery solving unless it quickly leads into a fight, trial, breakthrough, escape, or confrontation.`
    : `世界专属风格规则：
东方玄幻是热血成长和宗门争锋，不是悬疑解谜，但危机必须渐进升级。
- 前期：以外门修炼、低阶切磋、巡山任务、押送灵草、小规模伏击、资源争夺、剑骨初醒为主。不要开局就写宗门崩溃、命灯被夺、百宗压境或终局级敌人。
- 中期：允许路线分化。主角可以留宗成长，也可以因陷害或战败离开宗门，被敌宗追杀，在逃亡中变强，或误入/主动闯入秘境，结识外援，获得传承。
- 后期：无论路线如何，都要逐渐回流到宗门危局。敌宗渗透应升级为命灯火种被夺、护山阵受损、长老受伤、宗门即将战败，等待主角回援或反攻。
- 终局方向：允许主角正面救宗、带秘境传承归来、在外部斩断敌宗命脉、救下弟子而非旧秩序，或失败后成为被追杀的传说。
每轮优先出现挑战、破阵、交锋、淬炼、破境、护宗、追杀、秘境试炼、逆命等行动。不要把主要行动写成纯调查、解读铭文、寻找痕迹或被动推理；即使出现线索，也必须迅速导向战斗、试炼、突破、逃亡或正面对抗。`;
}

function sanityStyleRule(stats: PlayerStats, language: Language) {
  if (stats.san <= 15) {
    return language === 'en'
      ? `Sanity state rule:
The protagonist is near mental collapse. The story and choices should show hallucination-like pressure, misread intent, trembling judgment, fear reactions, and a need to anchor reality.
Do not rewrite established facts or invent contradictions. Treat unstable perception as subjective experience, then let concrete actions and consequences remain clear.`
      : `理智状态规则：
主角已经接近精神崩溃。剧情和选项应体现幻觉式压迫、误认敌意、判断颤抖、恐惧反应，以及重新确认现实的需求。
不要改写既有事实，也不要制造前后矛盾。把不稳定感写成主观感受，但具体行动和后果仍要清楚。`;
  }

  if (stats.san <= 30) {
    return language === 'en'
      ? `Sanity state rule:
The protagonist's sanity is low. The story and choices should show hesitation, suspicion, overreaction, unstable focus, and costly judgment.
Do not turn every scene into pure madness; keep the main action grounded in the current event.`
      : `理智状态规则：
主角理智偏低。剧情和选项应体现迟疑、疑神疑鬼、过度反应、注意力不稳和判断代价。
不要把每一幕都写成彻底疯狂，主要行动仍要落在当前事件上。`;
  }

  return '';
}

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

const choiceRhythmGuide = `选项方向规则：
- 三个选项都必须承接当前剧情最后局面。
- 选项文本必须贴合各自的预设结果，不要把高代价选项写得像无风险选择。
- 不要在选项文本中出现具体数值、加减号或属性名。
- A/B/C 必须有明显不同的风险气质，不要都只是调查异常、靠近异常或凝视异常。`;

const storyBeatGuide = `本轮剧情必须包含：
- 一个明确行动：主角真的做了什么，而不是只观察气氛。
- 一个阻碍、机会或代价：危险、消耗、发现、支援、训练、修复、谈判、恢复、资源变化等。
- 一个阶段性结果：脱险、受伤、恢复、获得线索、装备改善、攻击方式变熟、防护增强、失去资源、得到帮助、触发陷阱等。
- 一个新的选择局面：最后停在玩家可以做出下一步选择的位置。`;

const settlementAnchorGuide = `可结算事件锚点：
- 生命变化锚点：擦伤、撞击、中毒、疲惫、包扎、治疗、短暂喘息、获得补给。
- 理智变化锚点：恐惧、混乱、真相冲击、稳定情绪、得到解释、同伴安抚、确认安全。
- 攻击变化锚点：获得武器、改装工具、练习招式、掌握敌人弱点、能量增强。
- 防御变化锚点：加固护具、找到掩体、修复屏障、获得护符、学会规避攻击。
- 无变化锚点：纯信息整理、平稳对话、低风险移动，但不要连续多轮无变化。
每轮正文至少要自然包含一个锚点，除非这是第 1 轮开场。不要在正文里写具体数值。`;

function controlSchemaDescription(language: Language) {
  return language === 'en'
    ? `Schema contract:
- schema_version: must be exactly "round_control_v1"
- resolution.summary: 2-300 character English sentence
- resolution.event_type: must be one of ${eventTypeValues}
- hidden_state_updates: must be an object; use empty arrays and progress: 0 when there is no update
- hidden_state_updates.progress: integer, always return 0; real main progress is calculated by the frontend from ChoicePlan.progress
- hidden_state_updates.key_clues/allies/injuries/flags: string arrays, max 5 items each
- hidden_state_updates.major_choices: string array, max 5 items
- removed_allies / healed_injuries: exact existing names to remove after departure, death or healing; omitted means no removal
- story_arc_updates: object; must include current_thread, unresolved_hooks, tension_level, finale_direction
- story_arc_updates.tension_level: integer from 1 to 5
- choices: exactly 3 items, ids must be "A", "B", "C" in order, text is a 2-80 character English action`
    : `字段契约：
- schema_version: 必须精确等于 "round_control_v1"
- resolution.summary: 2-300 字中文短句
- resolution.event_type: 只能是 ${eventTypeValues} 其中一个
- hidden_state_updates: 必须是对象；没有更新时使用空数组和 progress: 0
- hidden_state_updates.progress: 整数，固定返回 0；真实主线推进由前端按 ChoicePlan.progress 计算
- hidden_state_updates.key_clues/allies/injuries/flags: 字符串数组，最多 5 项
- hidden_state_updates.major_choices: 字符串数组，最多 5 项
- removed_allies / healed_injuries: 本轮离队或死亡盟友、已痊愈伤势的原始名称数组；省略表示不移除，不要仅添加相反描述
- story_arc_updates: 对象；必须包含 current_thread、unresolved_hooks、tension_level、finale_direction
- story_arc_updates.tension_level: 整数，范围 1 到 5
- choices: 必须正好 3 项，id 必须依次为 "A", "B", "C"，text 为 2-80 字中文行动`;
}

const openingControlExample = `{
  "schema_version": "round_control_v1",
  "resolution": {
    "summary": "主角抵达故事开端，局势尚未造成明确损耗。",
    "event_type": "normal"
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
}`;

function finaleSchemaDescription(language: Language) {
  return language === 'en'
    ? `Schema contract:
 - schema_version: must be exactly "finale_v1"
 - ending_kind: must be one of "death", "collapse", "incomplete", "bittersweet", "standard", "perfect" and must match the frontend decision
 - title: 2-40 English characters
 - finale_story: 80-2600 English characters`
    : `字段契约：
 - schema_version: 必须精确等于 "finale_v1"
 - ending_kind: 必须是 death、collapse、incomplete、bittersweet、standard、perfect 之一，并严格匹配前端判定
 - title: 2-40 字中文标题
 - finale_story: 80-2600 字中文终局正文`;
}

const finaleOutputExample = `{
  "schema_version": "finale_v1",
  "ending_kind": "death",
  "title": "终幕标题",
  "finale_story": "这里写终局正文，承接最后一轮发生的事件，不生成行动选项。"
}`;

function statsText(stats: PlayerStats) {
  return `生命 ${stats.hp}/100，理智 ${stats.san}/100，攻击 ${stats.atk}，防御 ${stats.def}`;
}

function localizedStatsText(stats: PlayerStats, language: Language) {
  return language === 'en'
    ? `Health ${stats.hp}/100, Sanity ${stats.san}/100, Attack ${stats.atk}, Defense ${stats.def}`
    : statsText(stats);
}

function stateContext(game: GameState) {
  return game.language === 'en'
    ? `Current round: Round ${game.round} / 100
Current stats: ${localizedStatsText(game.player_stats, game.language)}
hidden_state: ${JSON.stringify(game.hidden_state)}
story_arc: ${JSON.stringify(game.story_arc)}
Recent 3 rounds: ${JSON.stringify(game.recent_history)}
Persistent chapter records: ${JSON.stringify(game.chapter_memories)}
Community branch: ${JSON.stringify(game.community)}
History summary: ${game.game_history_summary || 'None'}`
    : `当前轮次：第 ${game.round} / 100 轮
当前属性：${localizedStatsText(game.player_stats, game.language)}
hidden_state：${JSON.stringify(game.hidden_state)}
story_arc：${JSON.stringify(game.story_arc)}
最近3轮：${JSON.stringify(game.recent_history)}
持久章节记录：${JSON.stringify(game.chapter_memories)}
居民支线：${JSON.stringify(game.community)}
历史摘要：${game.game_history_summary || '暂无'}`;
}

function storyContext(story: Story) {
  return `本轮标题：${story.title}
本轮正文：
${story.body}`;
}

function statChangesText(changes: Partial<PlayerStats>) {
  const labels: Record<keyof PlayerStats, string> = {
    hp: '生命',
    san: '理智',
    atk: '攻击',
    def: '防御'
  };
  const entries = (Object.entries(changes) as Array<[keyof PlayerStats, number]>)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${labels[key]} ${value > 0 ? `+${value}` : value}`);

  return entries.length ? entries.join('，') : '属性无变化';
}

function localizedStatChangesText(changes: Partial<PlayerStats>, language: Language) {
  if (language === 'zh') return statChangesText(changes);

  const labels: Record<keyof PlayerStats, string> = {
    hp: 'Health',
    san: 'Sanity',
    atk: 'Attack',
    def: 'Defense'
  };
  const entries = (Object.entries(changes) as Array<[keyof PlayerStats, number]>)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${labels[key]} ${value > 0 ? `+${value}` : value}`);

  return entries.length ? entries.join(', ') : 'No stat change';
}

function choicePlanContext(choice: Choice, language: Language) {
  if (language === 'en') {
    return `Choice ${choice.id}
Current text: ${choice.text}
Risk label: ${choice.plan.risk_label}
Outcome tone: ${choice.plan.tone}
Preset stat result: ${localizedStatChangesText(choice.plan.stat_changes, language)}
Main progress: +${choice.plan.progress}
Rule checks: ${choice.plan.checks.join(', ') || 'none'}
Narrative intent: ${choice.plan.intent}
Settlement hint: ${choice.plan.settlement_hint}`;
  }

  return `选项 ${choice.id}
当前文本：${choice.text}
风险标签：${choice.plan.risk_label}
结果基调：${choice.plan.tone}
预设数值结果：${localizedStatChangesText(choice.plan.stat_changes, language)}
主线进度：+${choice.plan.progress}
规则检查：${choice.plan.checks.join('、') || '无'}
叙事意图：${choice.plan.intent}
结算提示：${choice.plan.settlement_hint}`;
}

function plannedChoicesContext(choices: Choice[], language: Language) {
  return choices.map((choice) => choicePlanContext(choice, language)).join('\n\n');
}

export function buildOpeningStoryPrompt(world: WorldDefinition) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你只负责生成第 1 轮开场剧情文本，不负责选项、结算或 JSON。${storyTextRule(world.language)}`
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

${worldStyleRule(world)}

规则：
0. ${outputLanguageRule(world.language)}
1. 只写已经发生的开场局面，不生成行动选项。
2. 不要出现属性变化、结算、系统提示、JSON 字段。
3. 不要替玩家做出后续选择。
4. 正文必须给玩家留下明确但开放的行动空间。`
    }
  ];
}

function resolvedChoiceContext(game: GameState, selectedChoice: Choice) {
  const result = previewChoiceResult(game, selectedChoice);
  return `${choicePlanContext({ ...selectedChoice, plan: { ...selectedChoice.plan,
    stat_changes: result.statChanges, progress: result.progressGain } }, game.language)}
Authoritative resulting stats: ${localizedStatsText(result.nextStats, game.language)}
Authoritative resulting progress: ${result.nextProgress}
Local modifiers: ${result.modifiers.join('; ')}
Community outcome: ${JSON.stringify(result.community)}
Use only these final changes. Do not invent an injury or gain that was fully prevented or capped.`;
}

export function buildRoundStoryPrompt(game: GameState, selectedChoice: Choice) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的叙事引擎。你只负责根据玩家选择生成本轮剧情文本，不负责选项、结算或 JSON。${storyTextRule(game.language)}`
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

${worldStyleRule(game.world)}

${sanityStyleRule(game.player_stats, game.language)}

上一轮标题：${game.current_story.title}
上一轮正文：${game.current_story.body}

玩家选择与本轮预设结果：
${resolvedChoiceContext(game, selectedChoice)}

规则：
0. ${outputLanguageRule(game.language)}
1. 只写本轮实际发生的剧情，不生成下一轮行动选项。
2. 不要写属性变化、结算摘要、JSON 字段或系统状态。
3. 不要直接宣布 failed、completed、game_over 或游戏结束。
4. 剧情必须承接玩家选择和 story_arc，不要跳到无关主线。
5. 必须围绕“预设数值结果”和“叙事意图”设计剧情，让每个非零变化都有自然原因。
6. 如果规则检查包含 attack，必须让攻击技巧、武器、压制或突破方式参与结果；如果包含 defense，必须让护具、掩体、屏障或承伤方式参与结果；如果包含 sanity，必须让判断稳定、恐惧、误认或重新确认现实参与结果。
7. 不要在正文里写具体数值、加减号或属性面板语言。
8. 如果预设结果包含增益，也必须写出获得、恢复、训练、加固、支援或资源利用的过程。
9. 如果预设结果包含损失，也必须写出受伤、消耗、冲击、破损或付出代价的过程。
10. 正文必须有实际进展和阶段性结果，不要只写氛围、观察和悬念。
11. 正文最后要停在一个适合生成三选项的局面。
12. 为下列后续行动铺垫可行的场景，但不要替玩家选择或提前兑现：
${plannedChoicesContext(planNextChoices(game, selectedChoice), game.language)}

${storyBeatGuide}

${settlementAnchorGuide}`
    }
  ];
}

export function buildOpeningControlPrompt(world: WorldDefinition, story: Story, plannedChoices: Choice[]) {
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

${worldStyleRule(world)}

下一轮预设选项计划：
${plannedChoicesContext(plannedChoices, world.language)}

规则：
0. ${outputLanguageRule(world.language)}
1. 这是第 1 轮，控制 JSON 不返回任何属性影响字段。
2. choices 必须正好 3 个，id 为 A/B/C。
3. choices 只能改写 text，不能改变每个选项的预设结果。
4. choices 必须承接开场正文最后的局面，并贴合各自的风险标签、结果基调和叙事意图。
5. 不要在选项文本中出现具体数值、加减号或属性名。
6. 不要返回 status、failed、completed、game_over、等级、金币、背包、声望、地点/时间/气氛状态。
7. 必须返回 hidden_state_updates 对象；没有更新时用空数组和 progress: 0。
8. 必须返回 story_arc_updates 对象；内容要延续世界主线，不要发明正文外的新事件。
9. 输出必须符合字段契约，并参考示例格式；不要照抄示例内容，要按本轮剧情填写。

${eventTypeGuide}

${choiceRhythmGuide}

字段契约：
${controlSchemaDescription(world.language)}

合法示例：
${openingControlExample}`
    }
  ];
}

export function buildRoundControlPrompt(game: GameState, selectedChoice: Choice, story: Story, plannedChoices: Choice[]) {
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

${worldStyleRule(game.world)}

${sanityStyleRule(game.player_stats, game.language)}

上一轮标题：${game.current_story.title}
上一轮正文：${game.current_story.body}
玩家选择与本轮预设结果：
${resolvedChoiceContext(game, selectedChoice)}

${storyContext(story)}

下一轮预设选项计划：
${plannedChoicesContext(plannedChoices, game.language)}

硬性规则：
0. ${outputLanguageRule(game.language)}
1. 控制 JSON 不返回 stat_effects、属性加减、最终数值或 status。
2. AI 不能返回 status、failed、completed、game_over，也不能直接宣布游戏结束。
3. resolution.summary 必须总结本轮剧情发生的实际结果，但不要写具体数值。
4. 根据正文选择最贴近的 event_type，不要总是使用 discovery、twist 或 ritual。
5. hidden_state_updates 和 story_arc_updates 只能提取或延续正文已经发生的信息，不能发明新线索、新道具或新角色。
6. story_arc_updates 应帮助 100 轮长线不跑偏，main_goal 不可改写。居民支线状态由本地规则控制，不要宣称未选择的援救或撤离已完成。
7. choices 必须正好 3 个，id 为 A/B/C；除非前端之后判断结束，否则这些选项会用于下一轮。
8. choices 只能改写 text，不能改变每个选项的预设结果。
9. choices 必须承接本轮正文最后的局面，并贴合各自的风险标签、结果基调和叙事意图。
10. 不要在选项文本中出现具体数值、加减号或属性名。
11. 输出必须符合字段契约，并参考示例格式；不要照抄示例内容，要按本轮剧情填写。

${eventTypeGuide}

${choiceRhythmGuide}

字段契约：
${controlSchemaDescription(game.language)}

合法示例：
${roundControlExample}`
    }
  ];
}

export function buildJsonRepairPrompt(
  rawText: string,
  schemaName: 'control' | 'finale',
  validationError: string,
  language: Language = 'zh'
) {
  const schema = schemaName === 'control' ? controlSchemaDescription(language) : finaleSchemaDescription(language);
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

function endingLabel(kind: EndingKind, language: Language) {
  const labels = {
    zh: { death: '死亡终局', collapse: '失控终局', incomplete: '未完成终局', bittersweet: '苦涩完成', standard: '标准完成', perfect: '完美完成' },
    en: { death: 'Death Ending', collapse: 'Collapse Ending', incomplete: 'Incomplete Ending', bittersweet: 'Bittersweet Ending', standard: 'Standard Ending', perfect: 'Perfect Ending' }
  } as const;
  return labels[language][kind];
}

function endingGuidance(kind: EndingKind, language: Language) {
  const guidance = {
    zh: {
      death: '承接最后一轮的伤势、代价和未完成目标，写出冒险如何走到尽头。',
      collapse: '主线已经走到终点，但理智崩溃改变了主角理解和承担结局的方式。',
      incomplete: '主角活着走到终点，却没有完成核心目标；保留未解决悬念和真实代价。',
      bittersweet: '主角完成了部分目标，但必须明确写出牺牲、失去或未能挽回的部分。',
      standard: '主角完成了主要目标，回收核心冲突，同时保留合理的余波。',
      perfect: '主角以较完整的状态解决核心目标，回收重要伏笔，但不要写成脱离过程的全知全能胜利。'
    },
    en: {
      death: 'Carry forward the final injuries, costs, and unfinished goals to show how the adventure ends.',
      collapse: 'The main journey reached its endpoint, but fractured sanity changes how the protagonist understands and bears the ending.',
      incomplete: 'The protagonist survives to the endpoint but does not complete the core goal; keep unresolved hooks and real costs visible.',
      bittersweet: 'The protagonist completes part of the goal, while clearly showing sacrifices, losses, or what could not be saved.',
      standard: 'The protagonist completes the main goal and resolves the central conflict, with believable aftermath.',
      perfect: 'The protagonist resolves the core goal in a relatively whole state and pays off important hooks without turning the victory into effortless omniscience.'
    }
  } as const;
  return guidance[language][kind];
}

export function buildFinalePrompt(game: GameState, ending: EndingContext) {
  return [
    {
      role: 'system' as const,
      content: `你是开放世界文字冒险游戏的终幕叙事引擎。前端已经判定终局类型，你只生成与该类型一致的终幕文案。${jsonOnlyRule}`
    },
    {
      role: 'user' as const,
      content: `为 ${endingLabel(ending.kind, game.language)} 生成终幕剧情。

世界：${game.world.name}
世界概览：${game.world.overview}
世界背景：${game.world.premise}
世界局势：${game.world.worldDetail}
核心悬念：${game.world.conflict}
最终属性：${localizedStatsText(game.player_stats, game.language)}
前端判定的结局类型：${ending.kind}
结局判定上下文：${JSON.stringify(ending)}
居民若已撤离，终幕必须交代其获救；若只获救尚未撤离，不得声称护送已完成。
当前轮次：第 ${game.round} / 100 轮
最后剧情：${game.current_story.title}
${game.current_story.body}
hidden_state：${JSON.stringify(game.hidden_state)}
story_arc：${JSON.stringify(game.story_arc)}
最近3轮：${JSON.stringify(game.recent_history)}
持久章节记录：${JSON.stringify(game.chapter_memories)}
居民支线：${JSON.stringify(game.community)}
历史摘要：${game.game_history_summary || '暂无'}

结局写作要求：${endingGuidance(ending.kind, game.language)}

规则：
0. ${outputLanguageRule(game.language)}
1. ending_kind 必须原样返回为 "${ending.kind}"，不能自行改变。
2. 不要生成选择按钮，不要生成下一步行动。
3. 终幕要承接最后一轮事件，不要改写玩家已做过的关键选择。
4. 不要生成评分、评级、分享短句或关键回顾。
5. 输出结构：
{
  "schema_version": "finale_v1",
  "ending_kind": "${ending.kind}",
  "title": "终幕标题",
  "finale_story": "${game.language === 'en' ? 'Finale story in English, 2-6 paragraphs' : '终幕剧情，中文，2-6段'}"
}`
    }
  ];
}
