import { describe, expect, it } from 'vitest';
import { getWorlds } from '../data/worlds';
import {
  applyHiddenStateUpdates,
  applyChoiceStatChanges,
  previewChoiceResult,
  planNextChoices,
  applyRoundOutput,
  applyStatChanges,
  applyStoryArcUpdates,
  createInitialGameState,
  createPlannedChoices,
  resolveEnding,
  resolveStatus
} from './rules';
import type { Choice, ModelRoundOutput } from './types';

function makeChoice(overrides: Partial<Choice['plan']> = {}): Choice {
  return {
    id: 'A',
    text: 'Press through the danger',
    plan: {
      risk_label: 'Risk',
      tone: 'tradeoff',
      stat_changes: { hp: -10 },
      progress: 2,
      intent: 'Advance despite the danger',
      settlement_hint: 'The advance came at a cost',
      checks: ['attack', 'defense', 'sanity'],
      ...overrides
    }
  };
}

function makeOutput(eventType: ModelRoundOutput['resolution']['event_type'] = 'normal'): ModelRoundOutput {
  return {
    schema_version: 'round_event_v1',
    story: { title: 'A Narrow Passage', body: 'The route opens after a difficult crossing.' },
    resolution: { summary: 'The route is open.', event_type: eventType },
    hidden_state_updates: {
      progress: 0,
      key_clues: ['marked door'],
      allies: [],
      injuries: [],
      flags: [],
      major_choices: []
    },
    story_arc_updates: {
      current_thread: 'Cross the marked door',
      unresolved_hooks: ['Who marked the door?'],
      tension_level: 2,
      finale_direction: 'Reach the source of the signal'
    },
    choices: [makeChoice(), { ...makeChoice(), id: 'B' }, { ...makeChoice(), id: 'C' }]
  };
}

describe('stat and state rules', () => {
  it('clamps every player stat to its supported range', () => {
    expect(
      applyStatChanges(
        { hp: 95, san: 5, atk: 29, def: 2 },
        { hp: 20, san: -20, atk: 10, def: -10 }
      )
    ).toEqual({ hp: 100, san: 0, atk: 30, def: 1 });
  });

  it('merges hidden state, removes duplicates, caps history, and trusts local progress', () => {
    const current = {
      progress: 98,
      key_clues: Array.from({ length: 11 }, (_, index) => `clue-${index}`),
      allies: [],
      injuries: [],
      flags: [],
      major_choices: []
    };

    const next = applyHiddenStateUpdates(current, {
      progress: 5,
      key_clues: ['clue-10', 'final-clue']
    });

    expect(next.progress).toBe(100);
    expect(next.key_clues).toHaveLength(12);
    expect(next.key_clues.at(-1)).toBe('final-clue');
    expect(new Set(next.key_clues).size).toBe(next.key_clues.length);
  });

  it('replaces the unresolved-hook snapshot while preserving omitted arc fields', () => {
    const current = {
      main_goal: 'Find the signal',
      current_thread: 'Enter the station',
      unresolved_hooks: ['old hook'],
      tension_level: 1,
      finale_direction: 'Restore control'
    };

    expect(applyStoryArcUpdates(current, { unresolved_hooks: ['new hook'], tension_level: 8 })).toEqual({
      ...current,
      unresolved_hooks: ['new hook'],
      tension_level: 5
    });
  });

  it('gives failure precedence when death and round 100 happen together', () => {
    expect(resolveStatus(100, { hp: 0, san: 80, atk: 12, def: 8 })).toBe('failed');
    expect(resolveStatus(100, { hp: 1, san: 0, atk: 12, def: 8 })).toBe('completed');
    expect(resolveStatus(99, { hp: 1, san: 0, atk: 12, def: 8 })).toBe('playing');
  });

  it('resolves all completion tiers from the same deterministic thresholds', () => {
    const stats = (san: number) => ({ hp: 40, san, atk: 12, def: 8 });
    const hidden = (progress: number) => ({ progress, key_clues: ['core clue'] });

    expect(resolveEnding(50, { ...stats(80), hp: 0 }, hidden(90))?.kind).toBe('death');
    expect(resolveEnding(100, stats(10), hidden(90))?.kind).toBe('collapse');
    expect(resolveEnding(100, stats(80), hidden(39))?.kind).toBe('incomplete');
    expect(resolveEnding(100, stats(80), hidden(40))?.kind).toBe('bittersweet');
    expect(resolveEnding(100, stats(80), hidden(70))?.kind).toBe('standard');
    expect(resolveEnding(100, stats(60), hidden(90))?.kind).toBe('perfect');
    expect(resolveEnding(100, stats(59), hidden(90))?.kind).toBe('standard');
    expect(resolveEnding(99, stats(80), hidden(90))).toBeUndefined();
  });
});

describe('choice planning', () => {
  it('is deterministic for the same complete game context', () => {
    const context = {
      round: 12,
      language: 'en' as const,
      worldId: 'scifi',
      stats: { hp: 71, san: 44, atk: 14, def: 10 },
      progress: 26
    };

    expect(createPlannedChoices(context)).toEqual(createPlannedChoices(context));
    expect(createPlannedChoices(context).map((choice) => choice.id)).toEqual(['A', 'B', 'C']);
  });

  it('makes high sanity recovery a deterministic probability, not a guarantee', () => {
    const withAnchor = Array.from({ length: 100 }, (_, index) =>
      createPlannedChoices({
        round: index + 1,
        language: 'en',
        worldId: 'scifi',
        stats: { hp: 50, san: 12, atk: 12, def: 8 },
        progress: index
      })
    ).filter((choices) => choices.some((choice) => choice.plan.risk_label === 'Anchor')).length;

    expect(withAnchor).toBeGreaterThan(20);
    expect(withAnchor).toBeLessThan(70);
    const context = {
      round: 14,
      language: 'en' as const,
      worldId: 'scifi',
      stats: { hp: 50, san: 12, atk: 12, def: 8 },
      progress: 20
    };
    expect(createPlannedChoices(context)).toEqual(createPlannedChoices(context));
  });

  it('offers health recovery independently of current HP with weighted strength', () => {
    const choicesAtFullHealth = Array.from({ length: 100 }, (_, index) =>
      createPlannedChoices({
        round: index + 1,
        language: 'en',
        worldId: 'scifi',
        stats: { hp: 100, san: 80, atk: 12, def: 8 },
        progress: index
      })
    );
    const recoveryChoices = choicesAtFullHealth.flatMap((choices) =>
      choices.filter((choice) => ['Bandage', 'First Aid', 'Full Recovery'].includes(choice.plan.risk_label))
    );

    expect(recoveryChoices.length).toBeGreaterThan(15);
    expect(recoveryChoices.length).toBeLessThan(55);
    expect(recoveryChoices.some((choice) => choice.plan.risk_label === 'First Aid')).toBe(true);
    expect(recoveryChoices.some((choice) => choice.plan.risk_label === 'Full Recovery')).toBe(true);

    const choicesAtLowHealth = Array.from({ length: 100 }, (_, index) =>
      createPlannedChoices({
        round: index + 1,
        language: 'en',
        worldId: 'scifi',
        stats: { hp: 20, san: 80, atk: 12, def: 8 },
        progress: index
      })
    );
    const lowHealthRecoveryCount = choicesAtLowHealth.flatMap((choices) =>
      choices.filter((choice) => ['Bandage', 'First Aid', 'Full Recovery'].includes(choice.plan.risk_label))
    ).length;
    expect(lowHealthRecoveryCount).toBeGreaterThan(15);
    expect(lowHealthRecoveryCount).toBeLessThan(55);
  });

  it('weights strong-stat actions without excluding other routes', () => {
    const labels = Array.from({ length: 200 }, (_, seed) => createPlannedChoices({
      round: 12, language: 'en', worldId: 'scifi', stats: { hp: 80, san: 80, atk: 16, def: 12 },
      progress: 8, runSeed: String(seed)
    })).flat().map((choice) => choice.plan.risk_label);
    expect(labels).toContain('Overpower');
    expect(labels).toContain('Guarded Advance');
    expect(labels).toContain('Pursuit');
    expect(labels).toContain('Clear-minded');
  });
});

describe('round settlement', () => {
  it('keeps ChoicePlan authoritative and applies combat modifiers before settlement', () => {
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      round: 5,
      player_stats: { hp: 30, san: 15, atk: 8, def: 6 }
    };
    const choice = makeChoice();
    const { nextGame, status } = applyRoundOutput(game, makeOutput('combat'), choice);

    expect(status).toBe('playing');
    expect(nextGame.round).toBe(6);
    expect(nextGame.player_stats.hp).toBe(5);
    expect(nextGame.hidden_state.progress).toBe(2);
    expect(nextGame.last_settlement?.stat_changes.hp).toBe(-25);
    expect(nextGame.last_settlement?.modifiers).toHaveLength(3);
    expect(nextGame.recent_history).toHaveLength(1);
  });

  it('uses plan checks instead of model event_type for numeric modifiers', () => {
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      player_stats: { hp: 50, san: 80, atk: 12, def: 8 }
    };
    const choice = makeChoice({ checks: ['sanity'] });
    const output = makeOutput('normal');
    const { nextGame } = applyRoundOutput(game, output, choice);

    expect(nextGame.last_settlement?.stat_changes.hp).toBe(-7);
    expect(nextGame.last_settlement?.modifiers).toEqual(['Clear judgment reduced the danger']);
  });

  it('paces progress so it cannot outrun the current round', () => {
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      round: 3,
      hidden_state: { ...createInitialGameState(getWorlds('en')[0]).hidden_state, progress: 0 }
    };
    const { nextGame } = applyRoundOutput(game, makeOutput(), makeChoice({ progress: 20 }));

    expect(nextGame.hidden_state.progress).toBe(4);
  });

  it('diminishes major breakthrough progress in the late game', () => {
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      round: 80,
      hidden_state: { ...createInitialGameState(getWorlds('en')[0]).hidden_state, progress: 70 }
    };
    const { nextGame } = applyRoundOutput(game, makeOutput(), makeChoice({ progress: 3 }));

    expect(nextGame.hidden_state.progress).toBe(72);
  });

  it('stops on the current round and removes choices after a fatal result', () => {
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      round: 37,
      player_stats: { hp: 7, san: 60, atk: 12, def: 8 }
    };
    const { nextGame, status } = applyRoundOutput(game, makeOutput(), makeChoice());

    expect(status).toBe('failed');
    expect(nextGame.round).toBe(37);
    expect(nextGame.player_stats.hp).toBe(0);
    expect(nextGame.choices).toEqual([]);
  });
});


describe('review regressions and persistent decisions', () => {
  it('always offers three unique choices across sanity thresholds and major rounds', () => {
    for (const world of getWorlds('en')) for (const san of [0, 9, 15, 24, 30, 31, 49, 70, 100]) {
      for (const round of [1, 3, 8, 13, 70, 98, 100]) for (const seed of ['one', 'two']) {
        const choices = createPlannedChoices({ round, language: 'en', worldId: world.id,
          stats: { hp: 20, san, atk: 30, def: 30 }, progress: round - 1, runSeed: seed });
        expect(choices.map((choice) => choice.id)).toEqual(['A', 'B', 'C']);
        expect(new Set(choices.map((choice) => choice.plan.risk_label)).size).toBe(3);
      }
    }
  });

  it('keeps the numeric route identical across languages, while seeds vary new runs', () => {
    const context = { round: 18, worldId: 'scifi', progress: 10,
      stats: { hp: 50, san: 30, atk: 18, def: 15 }, runSeed: 'shared' };
    const numeric = (choices: Choice[]) => choices.map(({ id, plan }) => ({ id,
      stat_changes: plan.stat_changes, progress: plan.progress, checks: plan.checks }));
    expect(numeric(createPlannedChoices({ ...context, language: 'zh' })))
      .toEqual(numeric(createPlannedChoices({ ...context, language: 'en' })));
    const variants = Array.from({ length: 20 }, (_, seed) => JSON.stringify(numeric(
      createPlannedChoices({ ...context, runSeed: String(seed) }))));
    expect(new Set(variants).size).toBeGreaterThan(1);
  });

  it('removes healed injuries and departed allies without erasing unmentioned state', () => {
    const initial = createInitialGameState(getWorlds('en')[0]).hidden_state;
    const next = applyHiddenStateUpdates({ ...initial, allies: ['medic', 'scout'], injuries: ['cut', 'burn'] },
      { allies: [], injuries: [], removed_allies: ['medic'], healed_injuries: ['cut'] });
    expect(next.allies).toEqual(['scout']);
    expect(next.injuries).toEqual(['burn']);
  });

  it('shows actual capped deltas, including lethal damage and capped growth', () => {
    const game = { ...createInitialGameState(getWorlds('en')[0]),
      player_stats: { hp: 95, san: 99, atk: 30, def: 29 } };
    const healing = makeChoice({ stat_changes: { hp: 18, san: 12, atk: 1, def: 3 }, progress: 0 });
    const result = applyRoundOutput(game, makeOutput(), healing).nextGame;
    expect(result.last_settlement?.stat_changes).toEqual({ hp: 5, san: 1, def: 1 });
    expect(result.recent_history[0].stat_changes).toEqual(result.last_settlement?.stat_changes);
    const death = applyRoundOutput({ ...game, player_stats: { ...game.player_stats, hp: 1 } },
      makeOutput(), makeChoice({ stat_changes: { hp: -35 }, progress: 0 })).nextGame;
    expect(death.last_settlement?.stat_changes.hp).toBe(-1);
    expect(death.finale_context?.kind).toBe('death');
  });

  it('uses one preview for late-game settlement and next-round planning', () => {
    const initial = createInitialGameState(getWorlds('en')[0], 'late');
    const game = { ...initial, round: 80, hidden_state: { ...initial.hidden_state, progress: 70 } };
    const choice = makeChoice({ progress: 3 });
    const preview = previewChoiceResult(game, choice);
    const next = applyRoundOutput(game, makeOutput(), choice).nextGame;
    expect(preview.nextProgress).toBe(72);
    expect(preview.nextStats).toEqual(next.player_stats);
    expect(planNextChoices(game, choice)).toEqual(createPlannedChoices({ round: next.round,
      worldId: next.world.id, language: next.language, stats: next.player_stats,
      progress: next.hidden_state.progress, runSeed: next.run_seed, community: next.community }));
  });

  it('converts capped momentum to preparation and rewards further attack growth', () => {
    const initial = createInitialGameState(getWorlds('en')[0]);
    const game = { ...initial, round: 3, hidden_state: { ...initial.hidden_state, progress: 3 } };
    const choice = makeChoice({ progress: 3, stat_changes: { hp: -20 }, checks: ['attack'] });
    expect(previewChoiceResult(game, choice).statChanges.def).toBe(2);
    const damage = (atk: number) => applyChoiceStatChanges({ hp: 80, san: 50, atk, def: 8 }, choice, 'en').statChanges.hp!;
    expect(damage(30)).toBeGreaterThan(damage(16));
    expect(damage(30)).toBeLessThan(0);
  });

  it('retains early chapter facts and locks the main goal', () => {
    let game = createInitialGameState(getWorlds('en')[0]);
    for (let round = 1; round <= 21; round++) {
      const output = makeOutput();
      output.resolution.summary = `Outcome ${round}`;
      output.hidden_state_updates.key_clues = [`clue ${round}`];
      game = applyRoundOutput(game, output, makeChoice({ stat_changes: {}, progress: 0 })).nextGame;
    }
    expect(game.chapter_memories).toHaveLength(2);
    expect(game.chapter_memories[0]).toContain('clue 1');
    expect(game.chapter_memories[0]).toContain('Outcome 1.');
    expect(game.game_history_summary).toContain('Outcome 21');
    expect(applyStoryArcUpdates(game.story_arc, { main_goal: 'Unrelated replacement' }).main_goal)
      .toBe(game.world.mainGoal);
  });

  it('completes the rescue, shelter and evacuation branch with persistent ending consequences', () => {
    const world = getWorlds('en').find((world) => world.id === 'apocalypse')!;
    let game = { ...createInitialGameState(world, 'rescue'), round: 10 };
    const planned = () => createPlannedChoices({ round: game.round, worldId: world.id, language: 'en',
      stats: game.player_stats, progress: game.hidden_state.progress, runSeed: game.run_seed, community: game.community });
    const rescue = planned().find((choice) => choice.plan.branch_action === 'rescue')!;
    game = applyRoundOutput(game, makeOutput(), rescue).nextGame;
    expect(game.community.stage).toBe('rescued');
    game.round = 12;
    const rest = planned().find((choice) => choice.plan.branch_action === 'shelter')!;
    expect(rest.plan.stat_changes).toEqual({ hp: 18, san: 4 });
    game = applyRoundOutput(game, makeOutput(), rest).nextGame;
    game.round = 15;
    expect(planned().some((choice) => choice.plan.branch_action === 'shelter')).toBe(false);
    game.round = 70;
    const evacuation = planned().find((choice) => choice.plan.branch_action === 'evacuate')!;
    game = applyRoundOutput(game, makeOutput(), evacuation).nextGame;
    expect(game.community.stage).toBe('evacuated');
    const hidden = { progress: 85, key_clues: ['known route'] };
    const stats = { hp: 30, san: 70, atk: 20, def: 16 };
    expect(resolveEnding(100, stats, hidden, { unresolved_hooks: [] }, game.community)?.kind).toBe('perfect');
    expect(resolveEnding(100, stats, hidden, { unresolved_hooks: [] })?.kind).toBe('standard');
    expect(resolveEnding(100, stats, { ...hidden, key_clues: [] }, { unresolved_hooks: [] }, game.community)?.kind).toBe('standard');
    expect(resolveEnding(100, stats, hidden, { unresolved_hooks: ['a', 'b', 'c'] }, game.community)?.kind).toBe('standard');
  });
  it('never falls back to capped training when all growth stats are full', () => {
    for (let seed = 0; seed < 100; seed++) {
      const choices = createPlannedChoices({ round: 12, worldId: 'scifi', runSeed: String(seed),
        stats: { hp: 100, san: 100, atk: 30, def: 30 } });
      const preparation = choices.find((choice) => choice.plan.progress === 0)!;
      expect(preparation.plan.stat_changes.hp).toBeGreaterThan(0);
      expect(preparation.plan.stat_changes.atk).toBeUndefined();
      expect(preparation.plan.stat_changes.def).toBeUndefined();
    }
  });

});
