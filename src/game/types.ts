export type GameStatus = 'idle' | 'playing' | 'failed' | 'completed';
export type Language = 'zh' | 'en';

export type EndingKind = 'death' | 'collapse' | 'incomplete' | 'bittersweet' | 'standard' | 'perfect';

export type EndingContext = {
  kind: EndingKind;
  progress: number;
  sanity: number;
  clueCount: number;
  unresolvedHookCount: number;
  communitySaved?: boolean;
};

export type PlayerStats = {
  hp: number;
  san: number;
  atk: number;
  def: number;
};

export type HiddenState = {
  progress: number;
  key_clues: string[];
  allies: string[];
  injuries: string[];
  flags: string[];
  major_choices: string[];
};

export type StoryArc = {
  main_goal: string;
  current_thread: string;
  unresolved_hooks: string[];
  tension_level: number;
  finale_direction: string;
};

export type Choice = {
  id: 'A' | 'B' | 'C';
  text: string;
  plan: ChoicePlan;
};

export type ChoiceCheck = 'attack' | 'defense' | 'sanity';

export type Story = {
  title: string;
  body: string;
};

export const EVENT_TYPES = [
  'normal',
  'exploration',
  'investigation',
  'social',
  'negotiation',
  'combat',
  'ambush',
  'escape',
  'stealth',
  'hazard',
  'trap',
  'puzzle',
  'discovery',
  'twist',
  'rest',
  'recovery',
  'training',
  'upgrade',
  'resource',
  'ally',
  'sacrifice',
  'ritual'
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type Resolution = {
  summary: string;
  event_type: EventType;
};

export type ChoiceTone = 'calm' | 'gain' | 'loss' | 'tradeoff' | 'major_gain' | 'major_loss';

export type ChoicePlan = {
  risk_label: string;
  tone: ChoiceTone;
  stat_changes: Partial<PlayerStats>;
  progress: number;
  intent: string;
  settlement_hint: string;
  checks: ChoiceCheck[];
  branch_action?: 'rescue' | 'shelter' | 'evacuate';
};

export type ModelControlOutput = {
  schema_version: 'round_control_v1';
  resolution: Resolution;
  hidden_state_updates: Partial<Omit<HiddenState, 'progress'>> & {
    progress?: number;
    removed_allies?: string[];
    healed_injuries?: string[];
  };
  story_arc_updates?: Partial<StoryArc>;
  choices: Choice[];
};

export type ModelRoundOutput = Omit<ModelControlOutput, 'schema_version'> & {
  schema_version: 'round_event_v1';
  story: Story;
};

export type FinaleOutput = {
  schema_version: 'finale_v1';
  ending_kind: EndingKind;
  title: string;
  finale_story: string;
};

export type WorldDefinition = {
  id: string;
  language: Language;
  name: string;
  tagline: string;
  cardDescription: string;
  cover: string;
  tone: string;
  overview: string;
  premise: string;
  worldDetail: string;
  conflict: string;
  playerIdentity: string;
  mainGoal: string;
  initialThread: string;
  finaleDirection: string;
};

export type HistoryEntry = {
  round: number;
  story_title: string;
  story_body: string;
  player_choice?: string;
  resolution_summary?: string;
  stat_changes?: Partial<PlayerStats>;
  facts?: string[];
};

export type RoundSettlement = {
  resolution: Resolution;
  stat_changes: Partial<PlayerStats>;
  reason: string;
  modifiers?: string[];
};

export type GameState = {
  run_seed: string;
  community: { stage: 'unmet' | 'rescued' | 'evacuated'; last_rest_round: number };
  chapter_memories: string[];
  status: GameStatus;
  round: number;
  language: Language;
  world: WorldDefinition;
  player_stats: PlayerStats;
  hidden_state: HiddenState;
  story_arc: StoryArc;
  current_story: Story;
  choices: Choice[];
  recent_history: HistoryEntry[];
  game_history_summary: string;
  last_settlement?: RoundSettlement;
  finale_context?: EndingContext;
  finale?: FinaleOutput;
};
