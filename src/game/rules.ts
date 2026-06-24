import type {
  Choice,
  GameState,
  GameStatus,
  HiddenState,
  HistoryEntry,
  ModelRoundOutput,
  PlayerStats,
  StatImpact,
  StoryArc,
  WorldDefinition
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

const STAT_EFFECT_VALUES: Record<keyof PlayerStats, Record<StatImpact, number>> = {
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

export function calculateStatChanges(output: ModelRoundOutput): Partial<PlayerStats> {
  const entries = (Object.keys(INITIAL_STATS) as Array<keyof PlayerStats>)
    .map((key) => [key, STAT_EFFECT_VALUES[key][output.stat_effects[key]]] as const)
    .filter(([, value]) => value !== 0);

  return Object.fromEntries(entries) as Partial<PlayerStats>;
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
    allies: unique([...current.allies, ...(updates.allies ?? [])]),
    injuries: unique([...current.injuries, ...(updates.injuries ?? [])]),
    flags: unique([...current.flags, ...(updates.flags ?? [])]),
    major_choices: unique([...current.major_choices, ...(updates.major_choices ?? [])])
  };
}

export function applyStoryArcUpdates(current: StoryArc, updates?: Partial<StoryArc>): StoryArc {
  if (!updates) return current;

  return {
    main_goal: updates.main_goal?.trim() || current.main_goal,
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

export function createInitialGameState(world: WorldDefinition): GameState {
  return {
    status: 'playing',
    round: 1,
    world,
    player_stats: INITIAL_STATS,
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
      title: '序章',
      body: ''
    },
    choices: [],
    recent_history: [],
    game_history_summary: ''
  };
}

export function getSelectedChoice(choices: Choice[], choiceId: Choice['id']) {
  return choices.find((choice) => choice.id === choiceId) ?? choices[0];
}

export function summarizeHistory(existingSummary: string, entry: HistoryEntry) {
  const line = `第${entry.round}轮：${entry.story_title}。玩家选择：${entry.player_choice ?? '无'}。结果：${
    entry.resolution_summary ?? '暂无'
  }。`;
  const merged = [existingSummary, line].filter(Boolean).join('\n');
  return merged.length > 1200 ? merged.slice(-1200) : merged;
}

export function applyRoundOutput(
  game: GameState,
  output: ModelRoundOutput,
  choiceText: string
): { nextGame: GameState; status: GameStatus } {
  const statChanges = calculateStatChanges(output);
  const nextStats = applyStatChanges(game.player_stats, statChanges);
  const nextHidden = applyHiddenStateUpdates(game.hidden_state, output.hidden_state_updates);
  const nextArc = applyStoryArcUpdates(game.story_arc, output.story_arc_updates);
  const status = resolveStatus(game.round, nextStats);
  const historyEntry: HistoryEntry = {
    round: game.round,
    story_title: output.story.title,
    story_body: output.story.body,
    player_choice: choiceText,
    resolution_summary: output.resolution.summary,
    stat_changes: statChanges
  };
  const recentHistory = [...game.recent_history, historyEntry].slice(-3);

  return {
    status,
    nextGame: {
      ...game,
      status,
      round: status === 'playing' ? game.round + 1 : game.round,
      player_stats: nextStats,
      hidden_state: nextHidden,
      story_arc: nextArc,
      current_story: output.story,
      choices: status === 'playing' ? output.choices : [],
      recent_history: recentHistory,
      game_history_summary: summarizeHistory(game.game_history_summary, historyEntry),
      last_settlement: {
        resolution: output.resolution,
        stat_changes: statChanges,
        reason: output.stat_effects.reason || output.resolution.summary
      }
    }
  };
}
