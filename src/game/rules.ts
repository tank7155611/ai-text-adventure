import type {
  Choice,
  GameState,
  GameStatus,
  HiddenState,
  HistoryEntry,
  Language,
  ModelRoundOutput,
  PlayerStats,
  StoryArc,
  WorldDefinition,
  EndingContext,
  EndingKind,
  ChoiceCheck
} from './types';

export const INITIAL_STATS: PlayerStats = {
  hp: 100,
  san: 80,
  atk: 12,
  def: 8
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function applyStatChanges(current: PlayerStats, changes: Partial<PlayerStats>): PlayerStats {
  return {
    hp: clamp(current.hp + (changes.hp ?? 0), 0, 100),
    san: clamp(current.san + (changes.san ?? 0), 0, 100),
    atk: clamp(current.atk + (changes.atk ?? 0), 1, 30),
    def: clamp(current.def + (changes.def ?? 0), 1, 30)
  };
}

function adjustHpLoss(changes: Partial<PlayerStats>, amount: number) {
  const currentHpChange = changes.hp ?? 0;
  const nextHpChange = currentHpChange + amount;
  return {
    ...changes,
    hp: Math.min(nextHpChange, 0)
  };
}

function applyEventStatModifiers(
  current: PlayerStats,
  baseChanges: Partial<PlayerStats>,
  language: Language,
  checks: ChoiceCheck[]
): { statChanges: Partial<PlayerStats>; modifiers: string[] } {
  let statChanges = { ...baseChanges };
  const modifiers: string[] = [];
  const hasHpLoss = (statChanges.hp ?? 0) < 0;

  if (!hasHpLoss) return { statChanges, modifiers };

  if (checks.includes('attack')) {
    if (current.atk <= 9) {
      statChanges = adjustHpLoss(statChanges, -7);
      modifiers.push(language === 'en' ? 'Low attack increased the cost of the action' : '攻击不足，行动代价加重');
    } else if (current.atk >= 16) {
      statChanges = adjustHpLoss(statChanges, 5 + Math.floor((current.atk - 16) / 3));
      modifiers.push(language === 'en' ? 'Strong attack pressure reduced the danger' : '攻击压制降低了危险');
    }
  }

  if (checks.includes('defense')) {
    if (current.def <= 6) {
      statChanges = adjustHpLoss(statChanges, -7);
      modifiers.push(language === 'en' ? 'Low defense caused you to take more damage' : '防御不足，承受了更多伤害');
    } else if (current.def >= 12) {
      statChanges = adjustHpLoss(statChanges, 5 + Math.floor((current.def - 12) / 4));
      modifiers.push(language === 'en' ? 'Defense absorbed part of the damage' : '防御抵消了部分伤害');
    }
  }

  if (checks.includes('sanity')) {
    if (current.san >= 70) {
      statChanges = adjustHpLoss(statChanges, 3);
      modifiers.push(language === 'en' ? 'Clear judgment reduced the danger' : '清晰判断降低了危险');
    } else if (current.san <= 15) {
      statChanges = adjustHpLoss(statChanges, -10);
      modifiers.push(
        language === 'en' ? 'Fractured sanity caused a severe misjudgment' : '理智濒临崩溃，严重误判加重了伤害'
      );
    } else if (current.san <= 30) {
      statChanges = adjustHpLoss(statChanges, -7);
      modifiers.push(
        language === 'en' ? 'Low sanity made judgment unstable and increased the danger' : '理智偏低，判断不稳增加了危险'
      );
    }
  }

  // Preparation can reduce danger, but cannot make a damaging action free.
  statChanges.hp = Math.min(statChanges.hp ?? 0, -Math.ceil(Math.abs(baseChanges.hp ?? 0) * 0.2));
  return { statChanges, modifiers };
}

export function applyChoiceStatChanges(
  current: PlayerStats,
  choice: Choice,
  language: Language
): { statChanges: Partial<PlayerStats>; modifiers: string[] } {
  const result = applyEventStatModifiers(current, choice.plan.stat_changes, language, choice.plan.checks);
  const hpChange = result.statChanges.hp ?? 0;
  if (hpChange < 0) {
    const maxLoss = choice.plan.progress >= 3 ? 35 : 25;
    result.statChanges.hp = Math.max(hpChange, -maxLoss);
  }
  return result;
}

type ChoicePlanContext = {
  round: number;
  language: Language;
  worldId: string;
  stats: PlayerStats;
  progress: number;
  runSeed: string;
  community: GameState['community'];
};

type PlanTemplate = {
  group: 'steady' | 'risk' | 'prepare' | 'major';
  tone: Choice['plan']['tone'];
  stat_changes: Partial<PlayerStats>;
  progress: number;
  risk_label: Record<Language, string>;
  intent: Record<Language, string>;
  settlement_hint: Record<Language, string>;
  minProgress?: number;
  maxProgress?: number;
  worldIds?: string[];
  when?: (context: ChoicePlanContext) => boolean;
  priorityWhen?: (context: ChoicePlanContext) => boolean;
  checks?: ChoiceCheck[];
  sanityRecoveryTier?: 'high';
  healthRecoveryTier?: 'basic' | 'strong' | 'full';
  branch_action?: Choice['plan']['branch_action'];
};

const resultPool: PlanTemplate[] = [
  {
    group: 'steady',
    tone: 'calm',
    stat_changes: { hp: -5 },
    progress: 1,
    risk_label: { zh: '稳妥', en: 'Steady' },
    intent: {
      zh: '稳扎稳打推进局面，用少量体力代价换取可靠进展',
      en: 'Advance steadily, paying a small physical cost for reliable progress'
    },
    settlement_hint: {
      zh: '稳妥推进仍消耗了一些体力',
      en: 'Steady progress still consumed some stamina'
    }
  },
  {
    group: 'steady',
    tone: 'calm',
    stat_changes: { hp: -6, san: -4 },
    progress: 1,
    risk_label: { zh: '谨慎', en: 'Careful' },
    intent: {
      zh: '谨慎确认当前局面，承受少量身心压力换取稳定线索',
      en: 'Confirm the situation carefully, taking light physical and mental pressure for stable information'
    },
    settlement_hint: {
      zh: '谨慎行动带来进展，也造成少量身心消耗',
      en: 'Careful action brought progress, but added light physical and mental strain'
    }
  },
  {
    group: 'steady',
    tone: 'tradeoff',
    stat_changes: { hp: -6, san: -3 },
    progress: 1,
    risk_label: { zh: '折中', en: 'Balanced' },
    intent: {
      zh: '选择折中路线，同时承担体力和精神上的小额消耗',
      en: 'Take a balanced route, accepting small physical and mental costs'
    },
    settlement_hint: {
      zh: '折中选择分散了风险，但仍有消耗',
      en: 'The balanced choice spread the risk, but still took a toll'
    }
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -12, atk: 1 },
    progress: 1,
    risk_label: { zh: '冒险', en: 'Risk' },
    intent: {
      zh: '冒险突破，以明显伤势换取攻击经验或压制优势',
      en: 'Break through at risk, taking clear injury for sharper attack experience'
    },
    settlement_hint: {
      zh: '冒险突破带来伤势，也让攻击方式更熟练',
      en: 'The risky breakthrough caused injury, but made your attacks more practiced'
    }
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -10, san: -8, def: 1 },
    progress: 1,
    risk_label: { zh: '强行', en: 'Forceful' },
    intent: {
      zh: '强行处理异常，承受身心冲击换取防护经验',
      en: 'Force through the anomaly, taking physical and mental shock for defensive experience'
    },
    settlement_hint: {
      zh: '强行处理带来身心冲击，也让防护手段更成熟',
      en: 'Forcing through hurt body and composure, but improved defensive technique'
    }
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -10, san: -5 },
    progress: 2,
    risk_label: { zh: '追击', en: 'Pursuit' },
    intent: {
      zh: '抓住机会追击推进，承受身心损耗换取更快主线进展',
      en: 'Push the opening aggressively, taking physical and mental strain for faster progress'
    },
    settlement_hint: {
      zh: '追击让局面推进更快，也带来身心损耗',
      en: 'The pursuit moved things forward faster, but strained body and mind'
    }
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -16, san: -8 },
    progress: 1,
    risk_label: { zh: '慌乱', en: 'Panic' },
    intent: {
      zh: '在心神不稳时仓促行动，勉强推进局面但更容易付出身心代价',
      en: 'Act under unstable nerves, forcing slight progress while risking heavier physical and mental cost'
    },
    settlement_hint: {
      zh: '心神不稳让行动变形，推进有限却付出了更多代价',
      en: 'Unstable nerves warped the action, giving limited progress at a higher cost'
    },
    when: ({ stats }) => stats.san <= 30,
    priorityWhen: ({ stats }) => stats.san <= 30
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -20, san: -10 },
    progress: 1,
    risk_label: { zh: '失控', en: 'Breakdown' },
    intent: {
      zh: '在理智濒临崩溃时强行突破，可能换来进展，也会让错误判断迅速放大',
      en: 'Force a breakthrough while near breakdown, gaining momentum at the cost of amplified mistakes'
    },
    settlement_hint: {
      zh: '接近崩溃的判断让突破变得失控，身体和心神都承受重压',
      en: 'Near-breakdown judgment made the breakthrough unstable, straining body and mind'
    },
    when: ({ stats }) => stats.san <= 15,
    priorityWhen: ({ stats }) => stats.san <= 15
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { hp: 18, san: -2 },
    progress: 0,
    risk_label: { zh: '包扎', en: 'Bandage' },
    intent: {
      zh: '暂缓推进处理伤口，以精神负担换取明显的生命恢复',
      en: 'Pause to treat your wounds, trading mental strain for a meaningful health recovery'
    },
    settlement_hint: {
      zh: '包扎止住了伤势，但精神仍承受压力',
      en: 'Bandaging stopped the bleeding, but your composure paid the cost'
    },
    healthRecoveryTier: 'basic'
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { hp: 30, san: -6 },
    progress: 0,
    risk_label: { zh: '急救', en: 'First Aid' },
    intent: {
      zh: '停下进行紧急处理，以明显精神压力换取大幅生命恢复',
      en: 'Stop for emergency treatment, trading heavy mental strain for a large health recovery'
    },
    settlement_hint: {
      zh: '急救暂时稳住了伤势，但精神受到了明显冲击',
      en: 'Emergency treatment stabilized the wounds, but sharply strained your mind'
    },
    healthRecoveryTier: 'strong'
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { hp: 45, san: -10 },
    progress: 0,
    risk_label: { zh: '彻底休整', en: 'Full Recovery' },
    intent: {
      zh: '放弃当前节奏彻底休整，以精神代价换取大幅生命恢复',
      en: 'Abandon the current tempo for full recovery, paying sanity for a major health recovery'
    },
    settlement_hint: {
      zh: '彻底休整让身体大幅恢复，但主线节奏和精神都付出了代价',
      en: 'Full recovery restored much of your body, but cost momentum and composure'
    },
    healthRecoveryTier: 'full'
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { san: 12, hp: -5 },
    progress: 0,
    risk_label: { zh: '稳心', en: 'Center' },
    intent: {
      zh: '暂缓脚步稳定心神，以少量体力消耗换取理智恢复',
      en: 'Slow down to steady the mind, trading a little stamina for sanity recovery'
    },
    settlement_hint: {
      zh: '稳定心神恢复了理智，但身体仍有消耗',
      en: 'Centering yourself restored sanity, though the body still paid a cost'
    },
    when: ({ stats }) => stats.san <= 75,
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { san: 18, hp: -8 },
    progress: 0,
    risk_label: { zh: '强稳', en: 'Ground' },
    intent: {
      zh: '暂缓推进，强行稳住心神并重新确认现实，但身体会因为停顿和戒备付出代价',
      en: 'Pause to force the mind steady and confirm reality again, paying physical cost through delay and vigilance'
    },
    settlement_hint: {
      zh: '强行稳住心神换回清醒，但停顿和戒备消耗了身体',
      en: 'Forcing yourself steady restored clarity, but the pause and vigilance taxed the body'
    },
    when: ({ stats }) => stats.san <= 30,
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { san: 30, hp: -12 },
    progress: 0,
    risk_label: { zh: '定魂', en: 'Anchor' },
    intent: {
      zh: '在崩溃边缘停下定魂，牺牲体力和节奏换取一次明显的理智回稳',
      en: 'Stop at the edge of collapse to anchor yourself, sacrificing stamina and tempo for a clear sanity recovery'
    },
    settlement_hint: {
      zh: '定魂让意识重新归位，但身体为此承受明显损耗',
      en: 'Anchoring brought awareness back into place, but the body paid a clear cost'
    },
    when: ({ stats }) => stats.san <= 49,
    sanityRecoveryTier: 'high'
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { def: 1, hp: -5 },
    progress: 0,
    risk_label: { zh: '加固', en: 'Fortify' },
    intent: {
      zh: '放慢推进加固防护，以体力消耗换取更可靠的防御',
      en: 'Slow the advance to fortify defenses, paying stamina for better protection'
    },
    settlement_hint: {
      zh: '防护准备更充分，但消耗了体力',
      en: 'Your defenses improved, but it cost stamina'
    }
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { atk: 1, hp: -5, san: -3 },
    progress: 0,
    risk_label: { zh: '磨炼', en: 'Train' },
    intent: {
      zh: '利用间隙磨炼攻击手段，以身心疲惫换取攻击成长',
      en: 'Use the pause to train offensive technique, trading physical and mental fatigue for attack growth'
    },
    settlement_hint: {
      zh: '磨炼提升了攻击手段，也带来身心疲惫',
      en: 'Training improved your attack, but brought physical and mental fatigue'
    },
    when: ({ stats }) => stats.atk < 30
  },
  {
    group: 'steady',
    tone: 'gain',
    stat_changes: { hp: -4, san: 3 },
    progress: 1,
    risk_label: { zh: '清醒', en: 'Clear-minded' },
    intent: {
      zh: '保持清醒梳理事实，在稳定判断中获得一点精神回稳并推进主线',
      en: 'Stay clear-minded, restoring composure while sorting facts and advancing the main thread'
    },
    settlement_hint: {
      zh: '清晰判断减少了精神损耗，也让行动更稳',
      en: 'Clear judgment steadied the action and restored a little composure'
    },
    when: ({ stats }) => stats.san >= 70,
    checks: []
  },
  {
    group: 'risk',
    tone: 'major_gain',
    stat_changes: { hp: -12 },
    progress: 2,
    risk_label: { zh: '压制', en: 'Overpower' },
    intent: {
      zh: '利用攻击优势正面压制关键阻碍，以较低代价换取明显推进',
      en: 'Use superior offense to overpower the key obstacle, gaining strong progress at a lower cost'
    },
    settlement_hint: {
      zh: '攻击优势压低了突破代价，并打开了关键通路',
      en: 'Offensive advantage reduced the breakthrough cost and opened a key route'
    },
    when: ({ stats }) => stats.atk >= 16,
    priorityWhen: ({ stats }) => stats.atk >= 16,
    checks: ['attack']
  },
  {
    group: 'steady',
    tone: 'gain',
    stat_changes: { hp: -7 },
    progress: 1,
    risk_label: { zh: '固守推进', en: 'Guarded Advance' },
    intent: {
      zh: '借助可靠防护穿过危险区，在少量消耗下稳步推进',
      en: 'Use reliable defenses to cross the danger zone and advance with a small cost'
    },
    settlement_hint: {
      zh: '防护吸收了部分危险，让推进更稳定',
      en: 'Strong defenses absorbed part of the danger and kept the advance stable'
    },
    when: ({ stats }) => stats.def >= 12,
    priorityWhen: ({ stats }) => stats.def >= 12,
    checks: ['defense']
  },
  {
    group: 'major',
    tone: 'calm',
    stat_changes: { hp: -10 },
    progress: 1,
    risk_label: { zh: '稳进', en: 'Measured' },
    intent: {
      zh: '在重大节点选择稳进路线，付出明显代价取得稳定推进',
      en: 'Take the measured path through a major moment, paying a clear cost for stable progress'
    },
    settlement_hint: {
      zh: '重大节点的稳进路线仍造成明显消耗',
      en: 'The measured path through a major moment still took a clear toll'
    }
  },
  {
    group: 'major',
    tone: 'major_gain',
    stat_changes: { hp: -18, san: -6, atk: 2, def: 1 },
    progress: 3,
    risk_label: { zh: '破局', en: 'Breakthrough' },
    intent: {
      zh: '抓住重大突破口，以高额损耗换取剧烈成长和主线推进',
      en: 'Seize the major opening, paying heavy costs for dramatic growth and progress'
    },
    settlement_hint: {
      zh: '破局造成高额损耗，也带来显著成长',
      en: 'The breakthrough caused heavy losses, but brought significant growth'
    }
  },
  {
    group: 'major',
    tone: 'major_loss',
    stat_changes: { hp: -22, san: -9, def: -1 },
    progress: 4,
    risk_label: { zh: '极限', en: 'Extreme' },
    intent: {
      zh: '选择极限代价路线，用严重损失强行撕开局面',
      en: 'Take the extreme route, tearing the situation open through severe loss'
    },
    settlement_hint: {
      zh: '极限选择强行推进局面，也造成沉重代价',
      en: 'The extreme choice forced progress, but at a heavy price'
    }
  },
  {
    group: 'major',
    tone: 'major_loss',
    stat_changes: { hp: -22, san: -14, atk: 1 },
    progress: 3,
    risk_label: { zh: '裂心', en: 'Fracture' },
    intent: {
      zh: '在重大节点以濒临崩溃的心神强行破局，换取爆发式推进和攻击成长',
      en: 'Force a major turn with a fractured mind, gaining explosive progress and sharper offense at high cost'
    },
    settlement_hint: {
      zh: '裂心破局带来爆发式推进，也让身心付出沉重代价',
      en: 'The fractured breakthrough brought explosive progress, but exacted a heavy toll'
    },
    when: ({ stats }) => stats.san <= 30,
    priorityWhen: ({ stats }) => stats.san <= 30
  },
  {
    group: 'risk',
    tone: 'tradeoff',
    stat_changes: { hp: -12, atk: 1 },
    progress: 1,
    risk_label: { zh: '试炼', en: 'Trial' },
    intent: {
      zh: '迎上宗门试炼或正面对战，在受伤中逼出剑骨锋芒',
      en: 'Face a sect trial or direct duel, drawing out the sword bone through injury'
    },
    settlement_hint: {
      zh: '试炼造成伤势，也逼出了更锋利的攻击',
      en: 'The trial caused injury, but sharpened your attack'
    },
    worldIds: ['xianxia']
  },
  {
    group: 'prepare',
    tone: 'gain',
    stat_changes: { def: 1, san: -3 },
    progress: 0,
    risk_label: { zh: '淬炼', en: 'Temper' },
    intent: {
      zh: '暂缓推进淬炼剑骨或防身法门，以精神压力换取防护成长',
      en: 'Pause to temper the sword bone or defensive form, trading mental pressure for protection'
    },
    settlement_hint: {
      zh: '淬炼增强了防护，也压迫了心神',
      en: 'Tempering improved protection, but pressed on the mind'
    },
    worldIds: ['xianxia']
  },
  {
    group: 'steady',
    tone: 'calm',
    stat_changes: { hp: -6, san: -2 },
    progress: 1,
    risk_label: { zh: '历练', en: 'Practice' },
    intent: {
      zh: '接下低阶历练或巡山任务，在小冲突中稳步成长',
      en: 'Take a low-level trial or patrol, growing through a smaller conflict'
    },
    settlement_hint: {
      zh: '低阶历练带来成长，也有少量身心消耗',
      en: 'The low-level trial brought growth, with minor physical and mental strain'
    },
    worldIds: ['xianxia'],
    maxProgress: 35
  }
];

const communityPlans: PlanTemplate[] = [
  {
    group: 'risk', tone: 'tradeoff', stat_changes: { hp: -8, san: 3 }, progress: 1,
    risk_label: { zh: '援救', en: 'Rescue' },
    intent: { zh: '折返救出被困的营地医护和居民，为他们找到避难所', en: 'Rescue trapped camp medics and residents and help them reach a shelter' },
    settlement_hint: { zh: '援救付出了体力，也赢得了避难所的信任', en: 'The rescue cost stamina and earned the shelter’s trust' },
    worldIds: ['apocalypse'], branch_action: 'rescue', checks: ['defense'],
    when: ({ round, community }) => community.stage === 'unmet' && round >= 10 && round <= 20 && round % 5 === 0
  },
  {
    group: 'risk', tone: 'major_gain', stat_changes: { hp: -10, san: 4 }, progress: 2,
    risk_label: { zh: '护送', en: 'Evacuate' },
    intent: { zh: '兑现承诺，护送避难所居民穿过封锁抵达安全地带', en: 'Keep your promise and escort the shelter residents through the blockade to safety' },
    settlement_hint: { zh: '居民成功撤离，这份援救会延续到终局', en: 'The residents reached safety; this rescue will endure beyond the ending' },
    worldIds: ['apocalypse'], branch_action: 'evacuate', checks: ['defense'],
    when: ({ round, community }) => community.stage === 'rescued' && round >= 70 && round % 5 === 0
  },
  {
    group: 'prepare', tone: 'gain', stat_changes: { hp: 18, san: 4 }, progress: 0,
    risk_label: { zh: '避难所', en: 'Shelter' },
    intent: { zh: '借助获救医护的补给联络点治疗伤势，暂缓主线行动', en: 'Pause your advance for treatment at the rescued medics’ supply post' },
    settlement_hint: { zh: '曾经救下的人提供了治疗，补给需要时间恢复', en: 'Those you rescued treated you; their supplies need time to replenish' },
    worldIds: ['apocalypse'], branch_action: 'shelter', checks: [],
    when: ({ round, community }) => community.stage !== 'unmet' && round - community.last_rest_round >= 6 && round % 3 === 0
  }
];

function isMajorEventRound(round: number) {
  return round >= 3 && (round - 3) % 5 === 0;
}

function makePlan(template: PlanTemplate, language: Language): Omit<Choice, 'id' | 'text'> {
  const checks = template.checks ?? [
    ...(template.group === 'risk' || template.group === 'major' ? (['attack', 'defense'] as ChoiceCheck[]) : []),
    ...((template.stat_changes.san ?? 0) < 0 ? (['sanity'] as ChoiceCheck[]) : [])
  ];

  return {
    plan: {
      risk_label: template.risk_label[language],
      tone: template.tone,
      stat_changes: template.stat_changes,
      progress: template.progress,
      intent: template.intent[language],
      settlement_hint: template.settlement_hint[language],
      checks,
      branch_action: template.branch_action
    }
  };
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFromGroup(group: PlanTemplate[], seed: string, used: Set<PlanTemplate>) {
  const candidates = group.filter((template) => !used.has(template));
  if (!candidates.length) return undefined;
  const picked = candidates[hashText(seed) % candidates.length];
  used.add(picked);
  return picked;
}

function highSanityRecoveryChance(san: number) {
  if (san <= 9) return 60;
  if (san <= 24) return 45;
  if (san <= 39) return 30;
  if (san <= 49) return 15;
  return 0;
}

function pickWeightedRecovery(
  templates: PlanTemplate[],
  seed: string
) {
  const weights: Record<NonNullable<PlanTemplate['healthRecoveryTier']>, number> = {
    basic: 18,
    strong: 9,
    full: 3
  };
  const totalWeight = templates.reduce(
    (total, template) => total + (template.healthRecoveryTier ? weights[template.healthRecoveryTier] : 0),
    0
  );
  if (!totalWeight) return undefined;

  let roll = hashText(seed) % totalWeight;
  for (const template of templates) {
    roll -= template.healthRecoveryTier ? weights[template.healthRecoveryTier] : 0;
    if (roll < 0) return template;
  }
  return undefined;
}

function normalizeChoicePlanContext(input: number | Partial<ChoicePlanContext>, language: Language): ChoicePlanContext {
  if (typeof input === 'number') {
    return {
      round: input,
      language,
      worldId: 'generic',
      stats: INITIAL_STATS,
      progress: 0,
      runSeed: 'default',
      community: { stage: 'unmet', last_rest_round: 0 }
    };
  }

  return {
    round: input.round ?? 1,
    language: input.language ?? language,
    worldId: input.worldId ?? 'generic',
    stats: input.stats ?? INITIAL_STATS,
    progress: input.progress ?? 0,
    runSeed: input.runSeed ?? 'default',
    community: input.community ?? { stage: 'unmet', last_rest_round: 0 }
  };
}

function filterTemplates(templates: PlanTemplate[], context: ChoicePlanContext) {
  return templates.filter((template) => {
    if ((template.stat_changes.atk ?? 0) > 0 && template.group === 'prepare' && context.stats.atk >= 30) return false;
    if ((template.stat_changes.def ?? 0) > 0 && template.group === 'prepare' && context.stats.def >= 30) return false;
    if (template.worldIds && !template.worldIds.includes(context.worldId)) return false;
    if (template.minProgress !== undefined && context.progress < template.minProgress) return false;
    if (template.maxProgress !== undefined && context.progress > template.maxProgress) return false;
    if (template.when && !template.when(context)) return false;
    return true;
  });
}

function shufflePlans(plans: Array<Omit<Choice, 'id' | 'text'>>, seed: string) {
  const result = [...plans];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = hashText(`${seed}:${index}`) % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createPlannedChoices(input: number | Partial<ChoicePlanContext>, language: Language = 'zh'): Choice[] {
  const context = normalizeChoicePlanContext(input, language);
  const majorRound = isMajorEventRound(context.round);
  const available = filterTemplates(resultPool, context);
  const seed = `${context.runSeed}:${context.worldId}:${context.round}:${context.progress}:${context.stats.hp}:${context.stats.san}:${context.stats.atk}:${context.stats.def}`;
  const groups: PlanTemplate['group'][] = majorRound ? ['major', 'major', 'prepare'] : ['steady', 'risk', 'prepare'];
  const used = new Set<PlanTemplate>();
  const pickedTemplates = groups.map((group, index) => {
    const groupPool = available.filter((template) => template.group === group);
    if (group === 'prepare') {
      const healthRecoveryPool = groupPool.filter((template) => template.healthRecoveryTier);
      const highRecoveryPool = groupPool.filter((template) => template.sanityRecoveryTier === 'high');
      const healthRecoveryChance = 35;
      const sanityRecoveryChance = highSanityRecoveryChance(context.stats.san);
      const recoveryRoll = hashText(`${seed}:recovery`) % 100;
      if (healthRecoveryPool.length && recoveryRoll < healthRecoveryChance) {
        const healthRecovery = pickWeightedRecovery(healthRecoveryPool, `${seed}:health-recovery:pick`);
        if (healthRecovery && !used.has(healthRecovery)) {
          used.add(healthRecovery);
          return healthRecovery;
        }
      }
      if (highRecoveryPool.length && recoveryRoll < healthRecoveryChance + sanityRecoveryChance) {
        const highRecovery = pickFromGroup(highRecoveryPool, `${seed}:high-sanity-recovery:pick`, used);
        if (highRecovery) return highRecovery;
      }
    }
    const regularGroupPool =
      group === 'prepare'
        ? groupPool.filter((template) => !template.healthRecoveryTier && !template.sanityRecoveryTier)
        : groupPool;
    const priorityPool = regularGroupPool.filter((template) => template.priorityWhen?.(context));
    const candidatePool = [...regularGroupPool, ...priorityPool];
    return pickFromGroup(candidatePool.length ? candidatePool : groupPool, `${seed}:${group}:${index}`, used);
  });
  const branch = communityPlans.find((template) => filterTemplates([template], context).length > 0);
  if (branch) pickedTemplates[2] = branch;
  const plans = pickedTemplates
    .filter((template): template is PlanTemplate => Boolean(template))
    .map((template) => makePlan(template, context.language));
  const shuffledPlans = shufflePlans(plans, seed);

  return shuffledPlans.map((choice, index) => ({
    id: ['A', 'B', 'C'][index] as Choice['id'],
    text: choice.plan.intent,
    plan: choice.plan
  }));
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(-12);
}

export function applyHiddenStateUpdates(
  current: HiddenState,
  updates: ModelRoundOutput['hidden_state_updates']
): HiddenState {
  return {
    progress: clamp(current.progress + (updates.progress ?? 0), 0, 100),
    key_clues: unique([...current.key_clues, ...(updates.key_clues ?? [])]),
    allies: unique([...current.allies, ...(updates.allies ?? [])]).filter((ally) => !updates.removed_allies?.includes(ally)),
    injuries: unique([...current.injuries, ...(updates.injuries ?? [])]).filter((injury) => !updates.healed_injuries?.includes(injury)),
    flags: unique([...current.flags, ...(updates.flags ?? [])]),
    major_choices: unique([...current.major_choices, ...(updates.major_choices ?? [])])
  };
}

export function applyStoryArcUpdates(current: StoryArc, updates?: Partial<StoryArc>): StoryArc {
  if (!updates) return current;

  return {
    main_goal: current.main_goal,
    current_thread: updates.current_thread?.trim() || current.current_thread,
    unresolved_hooks: unique([...(updates.unresolved_hooks ?? current.unresolved_hooks)]),
    tension_level: clamp(updates.tension_level ?? current.tension_level, 1, 5),
    finale_direction: updates.finale_direction?.trim() || current.finale_direction
  };
}

export function resolveStatus(round: number, stats: PlayerStats): GameStatus {
  if (stats.hp <= 0) return 'failed';
  if (round >= 100) return 'completed';
  return 'playing';
}

export function resolveEnding(
  round: number,
  stats: PlayerStats,
  hiddenState: Pick<HiddenState, 'progress' | 'key_clues'>,
  storyArc?: Pick<StoryArc, 'unresolved_hooks'>,
  community?: GameState['community']
): EndingContext | undefined {
  const contextBase = {
    progress: hiddenState.progress,
    sanity: stats.san,
    clueCount: hiddenState.key_clues.length,
    unresolvedHookCount: storyArc?.unresolved_hooks.length ?? 0,
    communitySaved: community?.stage === 'evacuated'
  };

  if (stats.hp <= 0) return { kind: 'death', ...contextBase };
  if (round < 100) return undefined;

  const kind: EndingKind =
    stats.san < 20
      ? 'collapse'
      : hiddenState.progress >= (community?.stage === 'evacuated' ? 85 : 90) && stats.san >= 60 &&
        hiddenState.key_clues.length > 0 && (storyArc?.unresolved_hooks.length ?? 0) <= 2
        ? 'perfect'
        : hiddenState.progress >= 70
          ? 'standard'
          : hiddenState.progress >= 40
            ? 'bittersweet'
            : 'incomplete';

  return { kind, ...contextBase };
}

export function createInitialGameState(world: WorldDefinition, runSeed: string = crypto.randomUUID()): GameState {
  return {
    run_seed: runSeed,
    community: { stage: 'unmet', last_rest_round: 0 },
    chapter_memories: [],
    status: 'playing',
    round: 1,
    language: world.language,
    world,
    player_stats: { ...INITIAL_STATS },
    hidden_state: {
      progress: 0,
      key_clues: [],
      allies: [],
      injuries: [],
      flags: [],
      major_choices: []
    },
    story_arc: {
      main_goal: world.mainGoal,
      current_thread: world.initialThread,
      unresolved_hooks: [],
      tension_level: 1,
      finale_direction: world.finaleDirection
    },
    current_story: {
      title: world.language === 'en' ? 'Prologue' : '序章',
      body: ''
    },
    choices: [],
      recent_history: [],
    game_history_summary: '',
    finale_context: undefined
  };
}

export function getSelectedChoice(choices: Choice[], choiceId: Choice['id']) {
  return choices.find((choice) => choice.id === choiceId);
}

export function summarizeHistory(existingSummary: string, entry: HistoryEntry, language: Language) {
  const line =
    language === 'en'
      ? `Round ${entry.round}: ${entry.story_title}. Player choice: ${entry.player_choice ?? 'none'}. Result: ${
          entry.resolution_summary ?? 'none'
        }.`
      : `第${entry.round}轮：${entry.story_title}。玩家选择：${entry.player_choice ?? '无'}。结果：${
          entry.resolution_summary ?? '暂无'
        }。`;
  const facts = entry.facts?.length ? ` [${entry.facts.join('; ')}]` : '';
  const merged = [existingSummary, (line + facts).replace(/\s+/g, ' ')].filter(Boolean).join('\n');
  return merged.split('\n').slice(-10).join('\n');
}

export function previewChoiceResult(game: GameState, selectedChoice: Choice) {
  const { statChanges: baseChanges, modifiers } = applyChoiceStatChanges(game.player_stats, selectedChoice, game.language);
  const rawProgress = selectedChoice.plan.progress;
  // After the main thread is substantially advanced, major breakthroughs give
  // a smaller marginal gain so the final stretch still requires deliberate play.
  const pacedRawProgress = game.hidden_state.progress >= 70 && rawProgress >= 3 ? rawProgress - 1 : rawProgress;
  const progressCeiling = Math.min(100, game.round + 1);
  const pacedProgress = Math.max(0, Math.min(pacedRawProgress, progressCeiling - game.hidden_state.progress));
  // Capped progress consolidates defenses instead of silently wasting the reward.
  const overflow = Math.max(0, pacedRawProgress - pacedProgress);
  if (overflow > 0) {
    baseChanges.def = (baseChanges.def ?? 0) + Math.min(2, overflow);
    modifiers.push(game.language === 'en' ? 'Excess momentum strengthened your defenses' : '多余的推进成果转为防护准备');
  }
  const nextStats = applyStatChanges(game.player_stats, baseChanges);
  const statChanges: Partial<PlayerStats> = {};
  for (const key of ['hp', 'san', 'atk', 'def'] as const) {
    const delta = nextStats[key] - game.player_stats[key];
    if (delta !== 0) statChanges[key] = delta;
  }
  const community = { ...game.community };
  if (game.world.id === 'apocalypse') {
    if (selectedChoice.plan.branch_action === 'rescue' && community.stage === 'unmet') community.stage = 'rescued';
    if (selectedChoice.plan.branch_action === 'shelter' && community.stage !== 'unmet') community.last_rest_round = game.round;
    if (selectedChoice.plan.branch_action === 'evacuate' && community.stage === 'rescued') community.stage = 'evacuated';
  }
  return { nextStats, statChanges, modifiers, progressGain: pacedProgress,
    nextProgress: game.hidden_state.progress + pacedProgress, community };
}

export function planNextChoices(game: GameState, selectedChoice: Choice) {
  const preview = previewChoiceResult(game, selectedChoice);
  return createPlannedChoices({ round: game.round + 1, language: game.language, worldId: game.world.id,
    stats: preview.nextStats, progress: preview.nextProgress, runSeed: game.run_seed, community: preview.community });
}

export function applyRoundOutput(
  game: GameState,
  output: ModelRoundOutput,
  selectedChoice: Choice
): { nextGame: GameState; status: GameStatus } {
  const { nextStats, statChanges, modifiers, progressGain: pacedProgress, community } = previewChoiceResult(game, selectedChoice);
  const nextHidden = applyHiddenStateUpdates(game.hidden_state, {
    ...output.hidden_state_updates,
    progress: pacedProgress
  });
  const nextArc = applyStoryArcUpdates(game.story_arc, output.story_arc_updates);
  const status = resolveStatus(game.round, nextStats);
  const historyEntry: HistoryEntry = {
    round: game.round,
    story_title: output.story.title,
    story_body: output.story.body,
    player_choice: `${selectedChoice.id}. ${selectedChoice.text}`,
    resolution_summary: output.resolution.summary,
    stat_changes: statChanges,
    facts: [...(output.hidden_state_updates.key_clues ?? []), ...(output.hidden_state_updates.major_choices ?? [])]
  };
  const recentHistory = [...game.recent_history, historyEntry].slice(-3);

  return {
    status,
    nextGame: {
      ...game,
      status,
      round: status === 'playing' ? game.round + 1 : game.round,
      player_stats: nextStats,
      community,
      hidden_state: nextHidden,
      story_arc: nextArc,
      current_story: output.story,
      choices: status === 'playing' ? output.choices : [],
        recent_history: recentHistory,
        game_history_summary: game.round % 10 === 0 ? '' : summarizeHistory(game.game_history_summary, historyEntry, game.language),
        chapter_memories: game.round % 10 === 0
          ? [...game.chapter_memories, summarizeHistory(game.game_history_summary, historyEntry, game.language)]
          : game.chapter_memories,
        finale_context:
          status === 'failed' || status === 'completed'
            ? resolveEnding(game.round, nextStats, nextHidden, nextArc, community)
            : undefined,
        last_settlement: {
        resolution: output.resolution,
        stat_changes: statChanges,
        reason: selectedChoice.plan.settlement_hint || output.resolution.summary,
        modifiers
      }
    }
  };
}
