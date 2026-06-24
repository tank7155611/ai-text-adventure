export type GameStatus = 'idle' | 'playing' | 'failed' | 'completed';

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
};

export type Story = {
  title: string;
  body: string;
};

export type Resolution = {
  summary: string;
  event_type: 'normal' | 'combat' | 'discovery' | 'danger' | 'rest' | 'twist';
};

export type StatImpact =
  | 'none'
  | 'minor_loss'
  | 'medium_loss'
  | 'major_loss'
  | 'minor_gain'
  | 'medium_gain'
  | 'major_gain';

export type StatEffects = {
  hp: StatImpact;
  san: StatImpact;
  atk: StatImpact;
  def: StatImpact;
  reason: string;
};

export type ModelRoundOutput = {
  schema_version: 'round_event_v1';
  story: Story;
  resolution: Resolution;
  stat_effects: StatEffects;
  hidden_state_updates: Partial<Omit<HiddenState, 'progress'>> & { progress?: number };
  story_arc_updates?: Partial<StoryArc>;
  choices: Choice[];
};

export type FinaleOutput = {
  schema_version: 'failure_finale_v1' | 'completion_finale_v1';
  title: string;
  finale_story: string;
};

export type WorldDefinition = {
  id: string;
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
};

export type RoundSettlement = {
  resolution: Resolution;
  stat_changes: Partial<PlayerStats>;
  reason: string;
};

export type GameState = {
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
