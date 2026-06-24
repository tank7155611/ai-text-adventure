import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronLeft, RotateCcw, Shield, Sparkles, Swords } from 'lucide-react';
import { worlds } from './data/worlds';
import {
  generateCompletionFinaleStream,
  generateFailureFinaleStream,
  generateOpeningControl,
  generateOpeningStoryStream,
  generateRoundControl,
  generateRoundStoryStream,
  type StreamPreview
} from './game/ai';
import { applyRoundOutput, createInitialGameState, getSelectedChoice } from './game/rules';
import type {
  Choice,
  GameState,
  ModelControlOutput,
  ModelRoundOutput,
  PlayerStats,
  RoundSettlement,
  Story,
  WorldDefinition
} from './game/types';

type Screen = 'home' | 'world-detail' | 'playing' | 'failed' | 'completed';
type BusyState = 'idle' | 'opening-stream' | 'opening-deciding' | 'round-stream' | 'round-deciding' | 'finale-stream';
type RetryTask =
  | { kind: 'opening'; world: WorldDefinition }
  | { kind: 'opening-control'; world: WorldDefinition; story: Story }
  | { kind: 'round'; game: GameState; choiceText: string }
  | { kind: 'round-control'; game: GameState; choiceText: string; story: Story };

function isStreamingBusy(busy: BusyState) {
  return busy === 'opening-stream' || busy === 'round-stream' || busy === 'finale-stream';
}

function isDecisionBusy(busy: BusyState) {
  return busy === 'opening-deciding' || busy === 'round-deciding';
}

function StatBar({
  label,
  value,
  max,
  kind
}: {
  label: string;
  value: number;
  max: number;
  kind: 'hp' | 'san';
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="stat-bar-row">
      <div className="stat-bar-label">
        <span>{label}</span>
        <strong>
          {value}/{max}
        </strong>
      </div>
      <div className="stat-bar-track">
        <div className={`stat-bar-fill ${kind}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatsPanel({ title, stats }: { title: string; stats: PlayerStats }) {
  return (
    <aside className="side-panel texture-panel">
      <div className="panel-kicker">STATUS</div>
      <h2>{title}</h2>
      <div className="stats-list">
        <StatBar label="生命" value={stats.hp} max={100} kind="hp" />
        <StatBar label="理智" value={stats.san} max={100} kind="san" />
        <div className="numeric-stat">
          <span>
            <Swords size={17} />
            攻击
          </span>
          <strong>{stats.atk}</strong>
        </div>
        <div className="numeric-stat">
          <span>
            <Shield size={17} />
            防御
          </span>
          <strong>{stats.def}</strong>
        </div>
      </div>
    </aside>
  );
}

const statLabels: Record<keyof PlayerStats, string> = {
  hp: '生命',
  san: '理智',
  atk: '攻击',
  def: '防御'
};

const eventTypeLabels: Record<RoundSettlement['resolution']['event_type'], string> = {
  normal: '事件',
  exploration: '探索',
  investigation: '调查',
  social: '交流',
  negotiation: '交涉',
  combat: '战斗',
  ambush: '伏击',
  escape: '逃脱',
  stealth: '潜行',
  hazard: '险境',
  trap: '陷阱',
  puzzle: '解谜',
  discovery: '发现',
  twist: '转折',
  rest: '休整',
  recovery: '恢复',
  training: '训练',
  upgrade: '强化',
  resource: '资源',
  ally: '援助',
  sacrifice: '代价',
  ritual: '仪式'
};

function SettlementPanel({ settlement }: { settlement: RoundSettlement }) {
  const changes = (Object.entries(settlement.stat_changes) as Array<[keyof PlayerStats, number]>).filter(
    ([, value]) => value !== 0
  );

  return (
    <div className="round-settlement" aria-label="本轮结算">
      <div className="settlement-heading">
        <span>本轮结算</span>
        <strong>{eventTypeLabels[settlement.resolution.event_type]}</strong>
      </div>
      <div className="settlement-chips">
        {changes.length ? (
          changes.map(([key, value]) => (
            <span
              key={key}
              className={`settlement-chip ${value > 0 ? 'positive' : 'negative'}`}
            >
              {statLabels[key]} {value > 0 ? `+${value}` : value}
            </span>
          ))
        ) : (
          <span className="settlement-chip neutral">属性无变化</span>
        )}
      </div>
      <p>{settlement.reason || settlement.resolution.summary}</p>
    </div>
  );
}

function TopBar({ roundLabel }: { roundLabel?: string }) {
  return (
    <header className="top-bar">
      <div className="brand">
        <BookOpen size={20} />
        <span>AI 文字冒险</span>
      </div>
      <div className="round-label">{roundLabel}</div>
      <div className="model-pill">gpt-5.5 已连接</div>
    </header>
  );
}

function HomeScreen({
  selectedWorld,
  onSelectWorld,
  onOpenWorld,
  onStart
}: {
  selectedWorld: WorldDefinition | null;
  onSelectWorld: (world: WorldDefinition) => void;
  onOpenWorld: (world: WorldDefinition) => void;
  onStart: (world: WorldDefinition) => void;
}) {
  return (
    <main className="home-shell">
      <div className="home-backdrop" />
      <TopBar />
      <section className="home-content">
        <div className="home-copy">
          <div className="eyebrow">LOCAL DEMO</div>
          <h1>AI 文字冒险</h1>
          <p>选择一个世界，开始你的 100 轮冒险。每一次选择都会改变生命、理智、攻击与防御。</p>
          <div className="feature-row">
            <span>100 轮</span>
            <span>三选项</span>
            <span>状态结算</span>
            <span>story_arc</span>
          </div>
        </div>

        <div className="world-grid" aria-label="世界选择">
          {worlds.map((world) => (
            <article
              className={`world-card ${selectedWorld?.id === world.id ? 'selected' : ''}`}
              key={world.id}
              onClick={() => onSelectWorld(world)}
            >
              <img src={world.cover} alt="" />
              <div className="world-card-shade" />
              <div className="world-card-content">
                <h2>{world.name}</h2>
                <p>{world.cardDescription}</p>
                <div className="card-actions">
                  <button type="button" className="ghost-button" onClick={(event) => {
                    event.stopPropagation();
                    onOpenWorld(world);
                  }}>
                    查看背景
                  </button>
                  <button type="button" className="primary-button compact" onClick={(event) => {
                    event.stopPropagation();
                    onStart(world);
                  }}>
                    开始冒险
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function WorldDetailScreen({
  world,
  onBack,
  onStart
}: {
  world: WorldDefinition;
  onBack: () => void;
  onStart: (world: WorldDefinition) => void;
}) {
  return (
    <main className="detail-shell" style={{ '--detail-cover': `url(${world.cover})` } as CSSProperties}>
      <div className="detail-cover" />
      <TopBar />
      <section className="detail-content texture-panel">
        <button type="button" className="text-button" onClick={onBack}>
          <ChevronLeft size={18} />
          返回世界选择
        </button>
        <div className="eyebrow">WORLD DETAIL</div>
        <h1>{world.name}</h1>
        <p className="lead">{world.overview}</p>
        <dl className="world-info">
          <div className="wide">
            <dt>世界局势</dt>
            <dd>{world.premise}</dd>
          </div>
          <div className="wide">
            <dt>隐藏冲突</dt>
            <dd>{world.worldDetail}</dd>
          </div>
          <div>
            <dt>玩家身份</dt>
            <dd>{world.playerIdentity}</dd>
          </div>
          <div>
            <dt>主要目标</dt>
            <dd>{world.mainGoal}</dd>
          </div>
          <div>
            <dt>开局线索</dt>
            <dd>{world.initialThread}</dd>
          </div>
          <div>
            <dt>核心悬念</dt>
            <dd>{world.conflict}</dd>
          </div>
        </dl>
        <div className="tone-strip">
          <span>叙事基调</span>
          <strong>{world.tone}</strong>
        </div>
        <button type="button" className="primary-button" onClick={() => onStart(world)}>
          开始冒险
        </button>
      </section>
    </main>
  );
}

function StoryPanel({
  title,
  body,
  busy,
  choices,
  settlement,
  onChoose,
  generationError,
  onRetry,
  retryLabel,
  terminal
}: {
  title: string;
  body: string;
  busy: BusyState;
  choices?: Choice[];
  settlement?: RoundSettlement;
  onChoose?: (choiceId: Choice['id']) => void;
  generationError?: string;
  onRetry?: () => void;
  retryLabel?: string;
  terminal?: boolean;
}) {
  return (
    <section className="story-column texture-panel">
      <div className="story-header">
        <div className="panel-kicker">{terminal ? 'FINALE' : 'STORY'}</div>
        <div className="story-title-row">
          <h1>{title || '生成中'}</h1>
          {isStreamingBusy(busy) ? (
            <span className="streaming-pill">
              <Sparkles size={15} />
              流式生成中
            </span>
          ) : null}
        </div>
      </div>
      <div className="story-scroll">
        {body.trim() ? (
          body.split('\n').map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)
        ) : (
          <p className="stream-placeholder">正在等待第一段剧情...</p>
        )}
      </div>
      {!terminal && busy === 'idle' && settlement ? <SettlementPanel settlement={settlement} /> : null}
      {terminal ||
      (busy === 'idle' && !choices?.length && !generationError) ||
      (isStreamingBusy(busy) && !choices?.length) ? null : (
        <div className="choice-area">
          <h2>选择行动</h2>
          {generationError && busy === 'idle' ? (
            <div className="choice-error" role="alert">
              <div className="choice-error-copy">
                <AlertTriangle size={18} />
                <div>
                  <strong>这一轮没有生成完整</strong>
                  <span>{generationError}</span>
                </div>
              </div>
              <button type="button" className="ghost-button compact-action" onClick={onRetry}>
                <RotateCcw size={16} />
                {retryLabel ?? '重新生成本轮'}
              </button>
            </div>
          ) : choices?.length && busy === 'idle' ? (
            <div className="choice-list">
              {choices.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  className="choice-button"
                  disabled={busy !== 'idle'}
                  onClick={() => onChoose?.(choice.id)}
                >
                  <span>{choice.id}</span>
                  {choice.text}
                </button>
              ))}
            </div>
          ) : isDecisionBusy(busy) ? (
            <div className="choice-loading" role="status" aria-live="polite">
              <Sparkles size={18} />
              <span>主角正在做出抉择...</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function GameShell({
  game,
  busy,
  onChoose,
  generationError,
  onRetry,
  retryLabel,
  onRestart,
  onHome
}: {
  game: GameState;
  busy: BusyState;
  onChoose?: (choiceId: Choice['id']) => void;
  generationError?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onRestart: () => void;
  onHome: () => void;
}) {
  const terminal = game.status === 'failed' || game.status === 'completed';
  const roundLabel = `第 ${game.round} / 100 轮`;
  const storyTitle = game.finale?.title ?? game.current_story.title;
  const storyBody = game.finale?.finale_story ?? game.current_story.body;

  return (
    <main className="game-shell">
      <div className="game-backdrop" />
      <TopBar roundLabel={roundLabel} />
      <section className="game-layout">
        <StatsPanel title={terminal ? '最终状态' : '当前状态'} stats={game.player_stats} />
        <StoryPanel
          title={storyTitle}
          body={storyBody}
          busy={busy}
          choices={game.choices}
          settlement={game.last_settlement}
          onChoose={onChoose}
          generationError={generationError}
          onRetry={onRetry}
          retryLabel={retryLabel}
          terminal={terminal}
        />
      </section>
      {terminal && busy === 'idle' ? (
        <footer className="terminal-actions">
          <button type="button" className="primary-button" onClick={onRestart}>
            <RotateCcw size={18} />
            重新开始
          </button>
          <button type="button" className="ghost-button" onClick={onHome}>
            返回首页
          </button>
        </footer>
      ) : null}
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedWorld, setSelectedWorld] = useState<WorldDefinition | null>(worlds[0]);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState<BusyState>('idle');
  const [error, setError] = useState('');
  const [retryTask, setRetryTask] = useState<RetryTask | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeWorld = useMemo(() => selectedWorld ?? worlds[0], [selectedWorld]);

  function combineRoundOutput(story: Story, control: ModelControlOutput): ModelRoundOutput {
    return {
      ...control,
      schema_version: 'round_event_v1',
      story
    };
  }

  function resetAbort() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }

  function applyStoryPreview(preview: StreamPreview, terminalSchema?: 'failure_finale_v1' | 'completion_finale_v1') {
    setGame((current) => {
      if (!current) return current;

      if (terminalSchema) {
        return {
          ...current,
          finale: {
            schema_version: terminalSchema,
            title: preview.title || current.finale?.title || (terminalSchema === 'failure_finale_v1' ? '冒险终止' : '终章'),
            finale_story: preview.body ?? current.finale?.finale_story ?? ''
          }
        };
      }

      return {
        ...current,
        current_story: {
          title: preview.title || current.current_story.title,
          body: preview.body ?? current.current_story.body
        }
      };
    });
  }

  async function startWorld(world: WorldDefinition) {
    const controller = resetAbort();
    const initial = createInitialGameState(world);
    setSelectedWorld(world);
    setGame(initial);
    setScreen('playing');
    setBusy('opening-stream');
    setError('');
    setRetryTask({ kind: 'opening', world });

    try {
      const story = await generateOpeningStoryStream(world, controller.signal, (preview) => {
        applyStoryPreview(preview);
        if (preview.bodyComplete) setBusy('opening-deciding');
      });
      setGame({ ...initial, current_story: story, choices: [] });
      await runOpeningControl(world, story, controller);
    } catch (err) {
      setError(err instanceof Error ? err.message : '开场生成失败，请重试。');
      setRetryTask({ kind: 'opening', world });
    } finally {
      setBusy('idle');
    }
  }

  async function runOpeningControl(world: WorldDefinition, story: Story, existingController?: AbortController) {
    const controller = existingController ?? resetAbort();
    const initial = createInitialGameState(world);
    setBusy('opening-deciding');
    setError('');
    setRetryTask({ kind: 'opening-control', world, story });

    try {
      const control = await generateOpeningControl(world, story, controller.signal);
      setGame({
        ...initial,
        current_story: story,
        choices: control.choices,
        hidden_state: {
          ...initial.hidden_state,
          progress: Math.max(0, control.hidden_state_updates.progress ?? 0),
          key_clues: control.hidden_state_updates.key_clues ?? [],
          allies: control.hidden_state_updates.allies ?? [],
          injuries: control.hidden_state_updates.injuries ?? [],
          flags: control.hidden_state_updates.flags ?? [],
          major_choices: control.hidden_state_updates.major_choices ?? []
        },
        story_arc: {
          ...initial.story_arc,
          ...(control.story_arc_updates ?? {})
        }
      });
      setRetryTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '开场选项生成失败，请重试。');
      setRetryTask({ kind: 'opening-control', world, story });
    } finally {
      setBusy('idle');
    }
  }

  async function finishRound(baseGame: GameState, output: ModelRoundOutput, choiceText: string, controller: AbortController) {
    const { nextGame, status } = applyRoundOutput(baseGame, output, choiceText);
    setGame(nextGame);
    setRetryTask(null);

    if (status === 'failed') {
      setBusy('finale-stream');
      setScreen('failed');
      setGame({
        ...nextGame,
        choices: [],
        finale: {
          schema_version: 'failure_finale_v1',
          title: '冒险终止',
          finale_story: ''
        }
      });
      try {
        const finale = await generateFailureFinaleStream(nextGame, controller.signal, (preview) =>
          applyStoryPreview(preview, 'failure_finale_v1')
        );
        setGame({ ...nextGame, finale, choices: [] });
      } catch {
        setGame({
          ...nextGame,
          choices: [],
          finale: {
            schema_version: 'failure_finale_v1',
            title: '冒险终止',
            finale_story: `${nextGame.current_story.body}\n\n${output.resolution.summary}`
          }
        });
      }
    } else if (status === 'completed') {
      setBusy('finale-stream');
      setScreen('completed');
      setGame({
        ...nextGame,
        choices: [],
        finale: {
          schema_version: 'completion_finale_v1',
          title: '终章',
          finale_story: ''
        }
      });
      try {
        const finale = await generateCompletionFinaleStream(nextGame, controller.signal, (preview) =>
          applyStoryPreview(preview, 'completion_finale_v1')
        );
        setGame({ ...nextGame, finale, choices: [] });
      } catch {
        setGame({
          ...nextGame,
          choices: [],
          finale: {
            schema_version: 'completion_finale_v1',
            title: '终章',
            finale_story: `${nextGame.current_story.body}\n\n这段冒险已经抵达第 100 轮，故事在此收束。`
          }
        });
      }
      setScreen('completed');
    }
  }

  async function runRoundControl(
    baseGame: GameState,
    choiceText: string,
    story: Story,
    existingController?: AbortController
  ) {
    const controller = existingController ?? resetAbort();
    setBusy('round-deciding');
    setError('');
    setRetryTask({ kind: 'round-control', game: baseGame, choiceText, story });

    try {
      const control = await generateRoundControl(baseGame, choiceText, story, controller.signal);
      const output = combineRoundOutput(story, control);
      await finishRound(baseGame, output, choiceText, controller);
    } catch (err) {
      setError(err instanceof Error ? err.message : '本轮选项生成失败，请重试。');
      setRetryTask({ kind: 'round-control', game: baseGame, choiceText, story });
    } finally {
      setBusy('idle');
    }
  }

  async function runRound(baseGame: GameState, choiceText: string) {
    const controller = resetAbort();
    setGame({
      ...baseGame,
      current_story: {
        title: '',
        body: ''
      },
      choices: [],
      last_settlement: undefined
    });
    setBusy('round-stream');
    setError('');
    setRetryTask({ kind: 'round', game: baseGame, choiceText });

    try {
      const story = await generateRoundStoryStream(baseGame, choiceText, controller.signal, (preview) => {
        applyStoryPreview(preview);
        if (preview.bodyComplete) setBusy('round-deciding');
      });
      setGame({ ...baseGame, current_story: story, choices: [], last_settlement: undefined });
      await runRoundControl(baseGame, choiceText, story, controller);
    } catch (err) {
      setError(err instanceof Error ? err.message : '本轮剧情生成失败，请重试。');
      setRetryTask({ kind: 'round', game: baseGame, choiceText });
    } finally {
      setBusy('idle');
    }
  }

  async function handleChoice(choiceId: Choice['id']) {
    if (!game || busy !== 'idle') return;

    const selectedChoice = getSelectedChoice(game.choices, choiceId);
    await runRound(game, `${selectedChoice.id}. ${selectedChoice.text}`);
  }

  function retryGeneration() {
    if (!retryTask || busy !== 'idle') return;

    if (retryTask.kind === 'opening') {
      void startWorld(retryTask.world);
      return;
    }

    if (retryTask.kind === 'opening-control') {
      void runOpeningControl(retryTask.world, retryTask.story);
      return;
    }

    if (retryTask.kind === 'round-control') {
      void runRoundControl(retryTask.game, retryTask.choiceText, retryTask.story);
      return;
    }

    void runRound(retryTask.game, retryTask.choiceText);
  }

  function goHome() {
    abortRef.current?.abort();
    setGame(null);
    setError('');
    setRetryTask(null);
    setBusy('idle');
    setScreen('home');
  }

  const restartWorld = () => startWorld(game?.world ?? activeWorld);
  const retryLabel =
    retryTask?.kind === 'opening-control' || retryTask?.kind === 'round-control'
      ? '重新生成选项'
      : '重新生成本轮';

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen
          selectedWorld={selectedWorld}
          onSelectWorld={setSelectedWorld}
          onOpenWorld={(world) => {
            setSelectedWorld(world);
            setScreen('world-detail');
          }}
          onStart={startWorld}
        />
      ) : null}

      {screen === 'world-detail' && selectedWorld ? (
        <WorldDetailScreen world={selectedWorld} onBack={() => setScreen('home')} onStart={startWorld} />
      ) : null}

      {(screen === 'playing' || screen === 'failed' || screen === 'completed') && game ? (
        <GameShell
          game={game}
          busy={busy}
          onChoose={handleChoice}
          generationError={error}
          onRetry={retryGeneration}
          retryLabel={retryLabel}
          onRestart={restartWorld}
          onHome={goHome}
        />
      ) : null}
    </>
  );
}
