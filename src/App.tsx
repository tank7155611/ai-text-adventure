import { MODEL, getConnectionStatus, subscribeConnectionStatus } from './services/llmClient';
import { type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, BookOpen, ChevronLeft, RotateCcw, Shield, Sparkles, Swords } from 'lucide-react';
import { getWorldById, getWorlds } from './data/worlds';
import {
  generateFinaleStream,
  generateOpeningControl,
  generateOpeningStory,
  generateRoundControl,
  generateRoundStory,
  type StreamPreview
} from './game/ai';
import {
  applyRoundOutput,
  applyHiddenStateUpdates,
  applyStoryArcUpdates,
  planNextChoices,
  createInitialGameState,
  createPlannedChoices,
  getSelectedChoice
} from './game/rules';
import type {
  Choice,
  GameState,
  Language,
  ModelControlOutput,
  ModelRoundOutput,
  PlayerStats,
  RoundSettlement,
  Story,
  WorldDefinition,
  EndingContext,
  EndingKind
} from './game/types';
import { endingLabelsByLanguage, eventTypeLabelsByLanguage, languageNames, statLabelsByLanguage, uiText } from './i18n';

type Screen = 'home' | 'world-detail' | 'playing' | 'failed' | 'completed';
type BusyState = 'idle' | 'opening-stream' | 'opening-deciding' | 'round-stream' | 'round-deciding' | 'finale-stream';
type PendingFinale = { status: 'failed' | 'completed'; game: GameState; output: ModelRoundOutput; ending: EndingContext };
type RetryTask =
  | { kind: 'opening'; world: WorldDefinition }
  | { kind: 'opening-control'; world: WorldDefinition; story: Story; plannedChoices: Choice[] }
  | { kind: 'round'; game: GameState; choice: Choice }
  | { kind: 'round-control'; game: GameState; choice: Choice; story: Story; plannedChoices: Choice[] };

const RETRY_CONTROL_REQUEST_TIMEOUT_MS = 90_000;

function isStreamingBusy(busy: BusyState) {
  return busy === 'opening-stream' || busy === 'round-stream' || busy === 'finale-stream';
}

function isDecisionBusy(busy: BusyState) {
  return busy === 'opening-deciding' || busy === 'round-deciding';
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const REVEAL_CHARS_PER_SECOND = 20;
const REVEAL_TICK_MS = 100;

async function revealText(
  text: string,
  controller: AbortController,
  onProgress: (visibleText: string) => void
) {
  if (controller.signal.aborted) return false;
  if (!text) {
    onProgress('');
    return true;
  }

  let visibleCharacters = 1;
  const startedAt = performance.now();
  onProgress(text.slice(0, visibleCharacters));

  while (visibleCharacters < text.length) {
    if (controller.signal.aborted) return false;
    await wait(REVEAL_TICK_MS);
    if (controller.signal.aborted) return false;
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    const nextVisibleCharacters = Math.min(
      text.length,
      Math.max(visibleCharacters, Math.floor(elapsedSeconds * REVEAL_CHARS_PER_SECOND) + 1)
    );
    if (nextVisibleCharacters === visibleCharacters) continue;
    visibleCharacters = nextVisibleCharacters;
    onProgress(text.slice(0, visibleCharacters));
  }

  return true;
}

function buildOpeningIntro(world: WorldDefinition): Story {
  if (world.language === 'en') {
    return {
      title: 'Prologue',
      body: [
        `${world.name}. ${world.overview}`,
        world.premise,
        world.worldDetail,
        `You are ${world.playerIdentity} Your goal is to ${world.mainGoal}`,
        `The first lead has surfaced: ${world.initialThread}`
      ].join('\n\n')
    };
  }

  return {
    title: '序章',
    body: [
      `${world.name}。${world.overview}`,
      world.premise,
      world.worldDetail,
      `你是${world.playerIdentity}你的目标是${world.mainGoal}`,
      `眼下的第一条线索已经浮现：${world.initialThread}`
    ].join('\n\n')
  };
}

function mergeOpeningStories(intro: Story, opening: Partial<Story>): Story {
  return {
    title: opening.title || intro.title,
    body: [intro.body, opening.body ?? ''].filter((part) => part.trim()).join('\n\n')
  };
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

function StatsPanel({
  title,
  stats,
  world,
  language
}: {
  title: string;
  stats: PlayerStats;
  world: WorldDefinition;
  language: Language;
}) {
  const t = uiText[language];
  return (
    <aside className="side-panel texture-panel">
      <div className="panel-kicker">STATUS</div>
      <h2>{title}</h2>
      <div className="stats-list">
        <StatBar label={t.hp} value={stats.hp} max={100} kind="hp" />
        <StatBar label={t.san} value={stats.san} max={100} kind="san" />
        <div className="numeric-stat">
          <span>
            <Swords size={17} />
            {t.atk}
          </span>
          <strong>{stats.atk}</strong>
        </div>
        <div className="numeric-stat">
          <span>
            <Shield size={17} />
            {t.def}
          </span>
          <strong>{stats.def}</strong>
        </div>
      </div>
      <div className="protagonist-card" aria-label={`${world.name} protagonist`}>
        <img src={`/assets/protagonists/${world.id}.png`} alt="" />
        <div className="protagonist-shade" />
        <div className="protagonist-caption">
          <span>{t.protagonist}</span>
          <strong>{world.playerIdentity}</strong>
        </div>
      </div>
    </aside>
  );
}

function SettlementPanel({ settlement, language }: { settlement: RoundSettlement; language: Language }) {
  const t = uiText[language];
  const statLabels = statLabelsByLanguage[language];
  const eventTypeLabels = eventTypeLabelsByLanguage[language];
  const changes = (Object.entries(settlement.stat_changes) as Array<[keyof PlayerStats, number]>).filter(
    ([, value]) => value !== 0
  );

  return (
    <div className="round-settlement" aria-label={t.roundSettlement}>
      <div className="settlement-heading">
        <span>{t.roundSettlement}</span>
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
          <span className="settlement-chip neutral">{t.noStatChange}</span>
        )}
      </div>
      <p>{settlement.reason || settlement.resolution.summary}</p>
      {settlement.modifiers?.length ? (
        <div className="settlement-modifiers">
          {settlement.modifiers.map((modifier) => (
            <span key={modifier}>{modifier}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopBar({
  roundLabel,
  language,
  onToggleLanguage
}: {
  roundLabel?: string;
  language: Language;
  onToggleLanguage?: () => void;
}) {
  const t = uiText[language];
  const connection = useSyncExternalStore(subscribeConnectionStatus, getConnectionStatus);
  const connectionLabels = language === 'zh'
    ? { idle: '待连接', requesting: '请求中', connected: '已连接', error: '连接失败' }
    : { idle: 'Not connected', requesting: 'Requesting', connected: 'Connected', error: 'Connection failed' };
  const nextLanguage: Language = language === 'zh' ? 'en' : 'zh';
  return (
    <header className="top-bar">
      <div className="brand">
        <BookOpen size={20} />
        <span>{t.appName}</span>
      </div>
      <div className="round-label">{roundLabel}</div>
      <div className="top-actions">
        <div className="model-pill">{MODEL} · {connectionLabels[connection]}</div>
        {onToggleLanguage ? (
          <button type="button" className="language-toggle" onClick={onToggleLanguage}>
            {languageNames[nextLanguage]}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function HomeScreen({
  language,
  worlds,
  selectedWorld,
  onSelectWorld,
  onOpenWorld,
  onStart,
  onToggleLanguage
}: {
  language: Language;
  worlds: WorldDefinition[];
  selectedWorld: WorldDefinition | null;
  onSelectWorld: (world: WorldDefinition) => void;
  onOpenWorld: (world: WorldDefinition) => void;
  onStart: (world: WorldDefinition) => void;
  onToggleLanguage: () => void;
}) {
  const t = uiText[language];
  return (
    <main className="home-shell">
      <div className="home-backdrop" />
      <TopBar language={language} onToggleLanguage={onToggleLanguage} />
      <section className="home-content">
        <div className="home-copy">
          <div className="eyebrow">{t.localDemo}</div>
          <h1>{t.homeTitle}</h1>
          <p>{t.homeSubtitle}</p>
          <div className="feature-row">
            {t.features.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </div>

        <div className="world-grid" aria-label={t.worldSelectLabel}>
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
                    {t.viewBackground}
                  </button>
                  <button type="button" className="primary-button compact" onClick={(event) => {
                    event.stopPropagation();
                    onStart(world);
                  }}>
                    {t.startAdventure}
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
  language,
  world,
  onBack,
  onStart
}: {
  language: Language;
  world: WorldDefinition;
  onBack: () => void;
  onStart: (world: WorldDefinition) => void;
}) {
  const t = uiText[language];
  return (
    <main className="detail-shell" style={{ '--detail-cover': `url(${world.cover})` } as CSSProperties}>
      <div className="detail-cover" />
      <TopBar language={language} />
      <section className="detail-content texture-panel">
        <button type="button" className="text-button" onClick={onBack}>
          <ChevronLeft size={18} />
          {t.backToWorlds}
        </button>
        <div className="eyebrow">{t.worldDetail}</div>
        <h1>{world.name}</h1>
        <p className="lead">{world.overview}</p>
        <dl className="world-info">
          <div className="wide">
            <dt>{t.worldSituation}</dt>
            <dd>{world.premise}</dd>
          </div>
          <div className="wide">
            <dt>{t.hiddenConflict}</dt>
            <dd>{world.worldDetail}</dd>
          </div>
          <div>
            <dt>{t.playerIdentity}</dt>
            <dd>{world.playerIdentity}</dd>
          </div>
          <div>
            <dt>{t.mainGoal}</dt>
            <dd>{world.mainGoal}</dd>
          </div>
          <div>
            <dt>{t.openingClue}</dt>
            <dd>{world.initialThread}</dd>
          </div>
          <div>
            <dt>{t.coreMystery}</dt>
            <dd>{world.conflict}</dd>
          </div>
        </dl>
        <div className="tone-strip">
          <span>{t.narrativeTone}</span>
          <strong>{world.tone}</strong>
        </div>
        <button type="button" className="primary-button" onClick={() => onStart(world)}>
          {t.startAdventure}
        </button>
      </section>
    </main>
  );
}

function StoryPanel({
  language,
  title,
  body,
  busy,
  choices,
  settlement,
  onChoose,
  generationError,
  onRetry,
  retryLabel,
  inlineLoadingText,
  pendingFinaleKind,
  terminalEndingKind,
  onViewFinale,
  terminal
}: {
  language: Language;
  title: string;
  body: string;
  busy: BusyState;
  choices?: Choice[];
  settlement?: RoundSettlement;
  onChoose?: (choiceId: Choice['id']) => void;
  generationError?: string;
  onRetry?: () => void;
  retryLabel?: string;
  inlineLoadingText?: string;
  pendingFinaleKind?: EndingKind;
  terminalEndingKind?: EndingKind;
  onViewFinale?: () => void;
  terminal?: boolean;
}) {
  const t = uiText[language];
  const storyScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLatestText = isStreamingBusy(busy) || isDecisionBusy(busy) || Boolean(inlineLoadingText);
  const shouldUseStreamingHeight = isStreamingBusy(busy) || Boolean(inlineLoadingText);
  const pendingFinaleCopy =
    pendingFinaleKind === 'death'
      ? {
          title: t.failedPendingTitle,
          body: t.failedPendingBody,
          action: t.viewFailureFinale
        }
      : pendingFinaleKind
        ? {
            title: t.completedPendingTitle,
            body: t.completedPendingBody,
            action: t.viewCompletionFinale
          }
        : null;

  useEffect(() => {
    if (!shouldFollowLatestText) return;
    const storyScroll = storyScrollRef.current;
    if (!storyScroll) return;
    window.requestAnimationFrame(() => {
      storyScroll.scrollTop = storyScroll.scrollHeight;
    });
  }, [body, title, busy, shouldFollowLatestText, inlineLoadingText]);

  return (
    <section className="story-column texture-panel">
      <div className="story-header">
        <div className="panel-kicker">{terminal ? t.finale : t.story}</div>
        <div className="story-title-row">
          <h1>{title || t.generating}</h1>
          {terminalEndingKind ? <span className="ending-pill">{endingLabelsByLanguage[language][terminalEndingKind]}</span> : null}
          {isStreamingBusy(busy) ? (
            <span className="streaming-pill">
              <Sparkles size={15} />
              {t.streaming}
            </span>
          ) : null}
        </div>
      </div>
      <div className={`story-scroll ${shouldUseStreamingHeight ? 'streaming' : ''}`} ref={storyScrollRef}>
        {body.trim() ? (
          body.split('\n').map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)
        ) : (
          <p className="stream-placeholder">{t.waitingStory}</p>
        )}
        {inlineLoadingText ? (
          <div className="story-inline-loading" role="status" aria-live="polite">
            <Sparkles size={16} />
            <span>{inlineLoadingText}</span>
          </div>
        ) : null}
      </div>
      {!terminal && busy === 'idle' && settlement ? (
        <SettlementPanel settlement={settlement} language={language} />
      ) : null}
      {!terminal && busy === 'idle' && pendingFinaleCopy ? (
        <div className="finale-callout" role="status">
          <div>
            <strong>{pendingFinaleCopy.title}</strong>
            <span>{pendingFinaleCopy.body}</span>
          </div>
          <button type="button" className="primary-button compact-action" onClick={onViewFinale}>
            <Sparkles size={16} />
            {pendingFinaleCopy.action}
          </button>
        </div>
      ) : null}
      {terminal ||
      pendingFinaleKind ||
      (busy === 'idle' && !choices?.length && !generationError) ? null : (
        <div className="choice-area">
          <h2>{t.chooseAction}</h2>
          {generationError && busy === 'idle' ? (
            <div className="choice-error" role="alert">
              <div className="choice-error-copy">
                <AlertTriangle size={18} />
                <div>
                  <strong>{t.incompleteRound}</strong>
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
          ) : isStreamingBusy(busy) ? (
            <div className="choice-loading" role="status" aria-live="polite">
              <Sparkles size={18} />
              <span>{t.preparingChoices}</span>
            </div>
          ) : isDecisionBusy(busy) ? (
            <div className="choice-loading" role="status" aria-live="polite">
              <Sparkles size={18} />
              <span>{t.deciding}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function GameShell({
  language,
  game,
  busy,
  onChoose,
  generationError,
  onRetry,
  retryLabel,
  inlineLoadingText,
  pendingFinaleKind,
  onViewFinale,
  showFinale,
  onRestart,
  onHome
}: {
  language: Language;
  game: GameState;
  busy: BusyState;
  onChoose?: (choiceId: Choice['id']) => void;
  generationError?: string;
  onRetry?: () => void;
  retryLabel?: string;
  inlineLoadingText?: string;
  pendingFinaleKind?: EndingKind;
  onViewFinale?: () => void;
  showFinale: boolean;
  onRestart: () => void;
  onHome: () => void;
}) {
  const t = uiText[language];
  const terminal = showFinale;
  const roundLabel = t.roundLabel(game.round);
  const storyTitle = terminal ? (game.finale?.title ?? game.current_story.title) : game.current_story.title;
  const storyBody = terminal ? (game.finale?.finale_story ?? game.current_story.body) : game.current_story.body;

  return (
    <main className="game-shell">
      <div className="game-backdrop" />
      <TopBar roundLabel={roundLabel} language={language} />
      <button type="button" className="game-home-button" onClick={onHome}>
        <ChevronLeft size={17} />
        {t.homeButton}
      </button>
      <section className="game-layout">
        <StatsPanel
          title={terminal ? t.finalStatus : t.currentStatus}
          stats={game.player_stats}
          world={game.world}
          language={language}
        />
        <StoryPanel
          language={language}
          title={storyTitle}
          body={storyBody}
          busy={busy}
          choices={game.choices}
          settlement={game.last_settlement}
          onChoose={onChoose}
          generationError={generationError}
          onRetry={onRetry}
          retryLabel={retryLabel}
          inlineLoadingText={inlineLoadingText}
          pendingFinaleKind={pendingFinaleKind}
          onViewFinale={onViewFinale}
          terminal={terminal}
          terminalEndingKind={terminal ? game.finale?.ending_kind : undefined}
        />
      </section>
      {terminal && busy === 'idle' ? (
        <footer className="terminal-actions">
          <button type="button" className="primary-button" onClick={onRestart}>
            <RotateCcw size={18} />
            {t.restart}
          </button>
          <button type="button" className="ghost-button" onClick={onHome}>
            {t.backHome}
          </button>
        </footer>
      ) : null}
    </main>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const localizedWorlds = useMemo(() => getWorlds(language), [language]);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedWorld, setSelectedWorld] = useState<WorldDefinition | null>(getWorlds('en')[0]);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState<BusyState>('idle');
  const [error, setError] = useState('');
  const [retryTask, setRetryTask] = useState<RetryTask | null>(null);
  const [pendingFinale, setPendingFinale] = useState<PendingFinale | null>(null);
  const [openingContinuationLoading, setOpeningContinuationLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const actionPendingRef = useRef(false);
  useEffect(() => () => abortRef.current?.abort(), []);

  function isCurrent(controller: AbortController) {
    return abortRef.current === controller && !controller.signal.aborted;
  }

  const t = uiText[language];
  const activeWorld = useMemo(() => selectedWorld ?? localizedWorlds[0], [localizedWorlds, selectedWorld]);

  function toggleLanguage() {
    const nextLanguage: Language = language === 'zh' ? 'en' : 'zh';
    setLanguage(nextLanguage);
    setSelectedWorld((current) => getWorldById(current?.id ?? activeWorld.id, nextLanguage));
    setGame((current) =>
      current
        ? {
            ...current,
            language: nextLanguage,
            world: getWorldById(current.world.id, nextLanguage)
          }
        : current
    );
  }

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
    actionPendingRef.current = true;
    return controller;
  }

  function applyStoryPreview(preview: StreamPreview, controller: AbortController, terminalEnding?: EndingContext) {
    if (!isCurrent(controller)) return;
    setGame((current) => {
      if (!current) return current;

      if (terminalEnding) {
        return {
          ...current,
          finale: {
            schema_version: 'finale_v1',
            ending_kind: terminalEnding.kind,
            title: preview.title || current.finale?.title || (terminalEnding.kind === 'death' ? '冒险终止' : '终章'),
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
    const plannedChoices = createPlannedChoices({
      round: 1,
      language: world.language,
      worldId: world.id,
      stats: initial.player_stats,
      progress: initial.hidden_state.progress,
      runSeed: initial.run_seed,
      community: initial.community
    });
    setSelectedWorld(world);
    setGame({ ...initial, choices: plannedChoices });
    setScreen('playing');
    setBusy('opening-stream');
    setError('');
    setPendingFinale(null);
    setOpeningContinuationLoading(false);
    setRetryTask({ kind: 'opening', world });

    try {
      const intro = buildOpeningIntro(world);
      // Attach rejection handling immediately, even while the local intro is playing.
      const openingStoryPromise = generateOpeningStory(world, controller.signal).then(
        (story) => ({ story, error: null }),
        (error: unknown) => ({ story: null, error })
      );

      const introRevealed = await revealText(intro.body, controller, (visibleBody) => {
        setGame((current) =>
          current
            ? { ...current, current_story: { ...intro, body: visibleBody }, choices: plannedChoices }
            : current
        );
      });
      if (!introRevealed || !isCurrent(controller)) return;

      setOpeningContinuationLoading(true);
      const result = await openingStoryPromise;
      if (!isCurrent(controller)) return;
      if (!result.story) throw result.error;
      const openingStory = result.story;
      const story = mergeOpeningStories(intro, openingStory);
      setOpeningContinuationLoading(false);
      const controlPromise = requestOpeningControl(world, story, plannedChoices, controller);
      const revealed = await revealOpeningStory(intro, openingStory, story, controller);
      if (!revealed || !isCurrent(controller)) return;
      setBusy('opening-deciding');
      const control = await controlPromise;
      if (control && isCurrent(controller)) commitOpeningControl(world, story, control);
    } catch (err) {
      if (!isCurrent(controller)) return;
      setError(err instanceof Error ? err.message : t.openingFailed);
      setRetryTask({ kind: 'opening', world });
    } finally {
      if (isCurrent(controller)) {
        setOpeningContinuationLoading(false);
        actionPendingRef.current = false;
        setBusy('idle');
      }
    }
  }

  async function runOpeningControl(
    world: WorldDefinition,
    story: Story,
    plannedChoices: Choice[],
    existingController?: AbortController
  ) {
    const controller = existingController ?? resetAbort();
    setBusy('opening-deciding');
    const control = await requestOpeningControl(
      world,
      story,
      plannedChoices,
      controller,
      RETRY_CONTROL_REQUEST_TIMEOUT_MS
    );
    if (!isCurrent(controller)) return;
    if (control) commitOpeningControl(world, story, control);
    actionPendingRef.current = false;
    setBusy('idle');
  }

  async function requestOpeningControl(
    world: WorldDefinition,
    story: Story,
    plannedChoices: Choice[],
    controller: AbortController,
    timeoutMs?: number
  ): Promise<ModelControlOutput | null> {
    setError('');
    setRetryTask({ kind: 'opening-control', world, story, plannedChoices });

    try {
      return await generateOpeningControl(world, story, plannedChoices, controller.signal, timeoutMs);
    } catch (err) {
      if (!isCurrent(controller)) return null;
      setError(err instanceof Error ? err.message : uiText[world.language].openingChoicesFailed);
      setRetryTask({ kind: 'opening-control', world, story, plannedChoices });
      return null;
    }
  }

  function commitOpeningControl(world: WorldDefinition, story: Story, control: ModelControlOutput) {
    const initial = createInitialGameState(world);
    setGame((current) => ({
      ...(current ?? initial),
      current_story: story,
      choices: control.choices,
      hidden_state: applyHiddenStateUpdates(current?.hidden_state ?? initial.hidden_state, control.hidden_state_updates),
      story_arc: applyStoryArcUpdates(current?.story_arc ?? initial.story_arc, control.story_arc_updates)
    }));
    setRetryTask(null);
  }

  async function revealOpeningStory(intro: Story, opening: Story, story: Story, controller: AbortController) {
    // The local intro has already been revealed. Only reveal the AI continuation
    // here, otherwise the intro would be appended a second time while animating.
    const body = opening.body;
    const revealed = await revealText(body, controller, (visibleBody) => {
      setGame((current) =>
        current
          ? {
              ...current,
              current_story: {
                title: story.title,
                body: [intro.body, visibleBody].filter((part) => part.trim()).join('\n\n')
              }
            }
          : current
      );
    });
    if (!revealed || !isCurrent(controller)) return false;

    setGame((current) => (current ? { ...current, current_story: story } : current));
    return true;
  }

  async function finishRound(baseGame: GameState, output: ModelRoundOutput, selectedChoice: Choice, controller: AbortController) {
    if (!isCurrent(controller)) return;
    const { nextGame, status } = applyRoundOutput(baseGame, output, selectedChoice);
    setRetryTask(null);

    if (status === 'failed' || status === 'completed') {
      const terminalReadyGame = { ...nextGame, choices: [] };
      setGame(terminalReadyGame);
      const ending = terminalReadyGame.finale_context ?? {
        kind: status === 'failed' ? 'death' : 'standard',
        progress: terminalReadyGame.hidden_state.progress,
        sanity: terminalReadyGame.player_stats.san,
        clueCount: terminalReadyGame.hidden_state.key_clues.length,
        unresolvedHookCount: terminalReadyGame.story_arc.unresolved_hooks.length
      } satisfies EndingContext;
      setPendingFinale({ status, game: terminalReadyGame, output, ending });
      setScreen('playing');
      return;
    }

    setPendingFinale(null);
    setGame(nextGame);
  }

  async function viewFinale() {
    if (!pendingFinale || actionPendingRef.current || busy !== 'idle') return;

    const controller = resetAbort();
    const { status, game: terminalGame, output, ending } = pendingFinale;
    const terminalText = uiText[terminalGame.language];
    const fallbackTitle = status === 'failed' ? terminalText.adventureEnded : terminalText.finalChapter;
    const fallbackStory =
      status === 'failed'
        ? `${terminalGame.current_story.body}\n\n${output.resolution.summary}`
        : `${terminalGame.current_story.body}\n\n${endingLabelsByLanguage[terminalGame.language][ending.kind]}${terminalGame.language === 'zh' ? '。' : '. '}${terminalGame.language === 'zh' ? '百轮旅程结束，你此前的行动与代价决定了这次结局。' : 'The hundred-round journey is over. Your actions and their costs have shaped this ending.'}`;

    setPendingFinale(null);
    setBusy('finale-stream');
    setError('');
    setRetryTask(null);
    setScreen(status);
    setGame({
      ...terminalGame,
      choices: [],
      finale: {
        schema_version: 'finale_v1',
        ending_kind: ending.kind,
        title: fallbackTitle,
        finale_story: ''
      }
    });

    try {
      const finale =
        await generateFinaleStream(terminalGame, ending, controller.signal, (preview) =>
          applyStoryPreview(preview, controller, ending)
        );
      if (!isCurrent(controller)) return;
      setGame({ ...terminalGame, choices: [], finale });
    } catch {
      if (!isCurrent(controller)) return;
      setGame({
        ...terminalGame,
        choices: [],
        finale: {
          schema_version: 'finale_v1',
          ending_kind: ending.kind,
          title: fallbackTitle,
          finale_story: fallbackStory
        }
      });
    } finally {
      if (isCurrent(controller)) {
        actionPendingRef.current = false;
        setBusy('idle');
      }
    }
  }

  async function runRoundControl(
    baseGame: GameState,
    selectedChoice: Choice,
    story: Story,
    plannedChoices: Choice[],
    existingController?: AbortController
  ) {
    const controller = existingController ?? resetAbort();
    setBusy('round-deciding');
    setError('');
    setRetryTask({ kind: 'round-control', game: baseGame, choice: selectedChoice, story, plannedChoices });

    try {
      const control = await generateRoundControl(
        baseGame,
        selectedChoice,
        story,
        plannedChoices,
        controller.signal,
        RETRY_CONTROL_REQUEST_TIMEOUT_MS
      );
      const output = combineRoundOutput(story, control);
      await finishRound(baseGame, output, selectedChoice, controller);
    } catch (err) {
      if (!isCurrent(controller)) return;
      setError(err instanceof Error ? err.message : uiText[baseGame.language].roundChoicesFailed);
      setRetryTask({ kind: 'round-control', game: baseGame, choice: selectedChoice, story, plannedChoices });
    } finally {
      if (isCurrent(controller)) {
        actionPendingRef.current = false;
        setBusy('idle');
      }
    }
  }

  async function requestRoundControl(
    baseGame: GameState,
    selectedChoice: Choice,
    story: Story,
    plannedChoices: Choice[],
    controller: AbortController
  ): Promise<ModelControlOutput | null> {
    setError('');
    setRetryTask({ kind: 'round-control', game: baseGame, choice: selectedChoice, story, plannedChoices });

    try {
      return await generateRoundControl(baseGame, selectedChoice, story, plannedChoices, controller.signal);
    } catch (err) {
      if (!isCurrent(controller)) return null;
      setError(err instanceof Error ? err.message : uiText[baseGame.language].roundChoicesFailed);
      setRetryTask({ kind: 'round-control', game: baseGame, choice: selectedChoice, story, plannedChoices });
      return null;
    }
  }

  async function revealRoundStory(story: Story, controller: AbortController) {
    const body = story.body;
    const revealed = await revealText(body, controller, (visibleBody) => {
      setGame((current) =>
        current
          ? { ...current, current_story: { title: story.title, body: visibleBody } }
          : current
      );
    });
    if (!revealed || !isCurrent(controller)) return false;

    setGame((current) => (current ? { ...current, current_story: story } : current));
    return true;
  }

  async function runRound(baseGame: GameState, selectedChoice: Choice) {
    const controller = resetAbort();
    const plannedChoices = planNextChoices(baseGame, selectedChoice);

    setGame({
      ...baseGame,
      current_story: {
        title: '',
        body: ''
      },
      choices: plannedChoices,
      last_settlement: undefined
    });
    setBusy('round-stream');
    setError('');
    setPendingFinale(null);
    setRetryTask({ kind: 'round', game: baseGame, choice: selectedChoice });

    try {
      const story = await generateRoundStory(baseGame, selectedChoice, controller.signal);
      if (!isCurrent(controller)) return;
      const controlPromise = requestRoundControl(baseGame, selectedChoice, story, plannedChoices, controller);
      const revealed = await revealRoundStory(story, controller);
      if (!revealed || !isCurrent(controller)) return;
      setBusy('round-deciding');
      const control = await controlPromise;
      if (control) {
        await finishRound(baseGame, combineRoundOutput(story, control), selectedChoice, controller);
      }
    } catch (err) {
      if (!isCurrent(controller)) return;
      setError(err instanceof Error ? err.message : uiText[baseGame.language].roundStoryFailed);
      setRetryTask({ kind: 'round', game: baseGame, choice: selectedChoice });
    } finally {
      if (isCurrent(controller)) {
        actionPendingRef.current = false;
        setBusy('idle');
      }
    }
  }

  async function handleChoice(choiceId: Choice['id']) {
    if (!game || actionPendingRef.current || busy !== 'idle' || error || pendingFinale) return;

    const selectedChoice = getSelectedChoice(game.choices, choiceId);
    if (!selectedChoice) return;
    await runRound(game, selectedChoice);
  }

  function retryGeneration() {
    if (!retryTask || actionPendingRef.current || busy !== 'idle') return;

    if (retryTask.kind === 'opening') {
      void startWorld(retryTask.world);
      return;
    }

    if (retryTask.kind === 'opening-control') {
      void runOpeningControl(retryTask.world, retryTask.story, retryTask.plannedChoices);
      return;
    }

    if (retryTask.kind === 'round-control') {
      void runRoundControl(retryTask.game, retryTask.choice, retryTask.story, retryTask.plannedChoices);
      return;
    }

    void runRound(retryTask.game, retryTask.choice);
  }

  function goHome() {
    abortRef.current?.abort();
    abortRef.current = null;
    actionPendingRef.current = false;
    setGame(null);
    setError('');
    setRetryTask(null);
    setPendingFinale(null);
    setOpeningContinuationLoading(false);
    setBusy('idle');
    setScreen('home');
  }

  const restartWorld = () => startWorld(game?.world ?? activeWorld);
  const retryLabel =
    retryTask?.kind === 'opening-control' || retryTask?.kind === 'round-control'
      ? t.retryChoices
      : t.retryRound;

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen
          language={language}
          worlds={localizedWorlds}
          selectedWorld={selectedWorld}
          onSelectWorld={setSelectedWorld}
          onOpenWorld={(world) => {
            setSelectedWorld(world);
            setScreen('world-detail');
          }}
          onStart={startWorld}
          onToggleLanguage={toggleLanguage}
        />
      ) : null}

      {screen === 'world-detail' && selectedWorld ? (
        <WorldDetailScreen
          language={language}
          world={selectedWorld}
          onBack={() => setScreen('home')}
          onStart={startWorld}
        />
      ) : null}

      {(screen === 'playing' || screen === 'failed' || screen === 'completed') && game ? (
        <GameShell
          language={language}
          game={game}
          busy={busy}
          onChoose={handleChoice}
          generationError={error}
          onRetry={retryGeneration}
          retryLabel={retryLabel}
          inlineLoadingText={openingContinuationLoading ? t.openingLoading : undefined}
          pendingFinaleKind={screen === 'playing' ? pendingFinale?.ending.kind : undefined}
          onViewFinale={viewFinale}
          showFinale={screen === 'failed' || screen === 'completed'}
          onRestart={restartWorld}
          onHome={goHome}
        />
      ) : null}
    </>
  );
}
