import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getWorlds } from '../src/data/worlds.ts';
import {
  previewChoiceResult,
  planNextChoices,
  applyRoundOutput,
  createInitialGameState,
  createPlannedChoices
} from '../src/game/rules.ts';

const strategies = ['conservative', 'balanced', 'aggressive', 'sanity-first'];

function delta(game, choice) {
  const preview = previewChoiceResult(game, choice);
  const changes = preview.statChanges;
  return {
    hp: changes.hp ?? 0,
    san: changes.san ?? 0,
    atk: changes.atk ?? 0,
    def: changes.def ?? 0,
    progress: preview.progressGain
  };
}

function choose(game, choices, strategy, recoveryThreshold) {
  const ranked = choices.map((choice) => ({ choice, change: delta(game, choice) }));

  const recovery = ranked
    .filter((item) => item.change.hp > 0 || item.change.san > 0)
    .sort((a, b) => b.change.hp + b.change.san - (a.change.hp + a.change.san))[0];

  if (strategy === 'balanced' && recovery && (game.player_stats.hp <= 45 || game.player_stats.san <= 25)) {
    return recovery.choice;
  }

  if (strategy === 'aggressive' && recovery && game.player_stats.hp <= recoveryThreshold) {
    return recovery.choice;
  }

  if (strategy === 'sanity-first' && recovery && game.player_stats.hp <= recoveryThreshold) {
    const hpRecovery = ranked
      .filter((item) => item.change.hp > 0)
      .sort((a, b) => b.change.hp - a.change.hp)[0];
    if (hpRecovery) return hpRecovery.choice;
  }

  if (strategy === 'conservative') {
    return ranked.sort((a, b) => {
      const aRecover = a.change.hp > 0 || (game.player_stats.san < 60 && a.change.san > 0);
      const bRecover = b.change.hp > 0 || (game.player_stats.san < 60 && b.change.san > 0);
      return Number(bRecover) - Number(aRecover) || b.change.hp - a.change.hp || b.change.progress - a.change.progress;
    })[0].choice;
  }

  if (strategy === 'aggressive') {
    return ranked.sort((a, b) => b.change.progress - a.change.progress || b.change.hp - a.change.hp || b.change.san - a.change.san)[0].choice;
  }

  if (strategy === 'sanity-first') {
    return ranked.sort((a, b) => {
      const aRecovery = a.change.san > 0;
      const bRecovery = b.change.san > 0;
      return Number(bRecovery) - Number(aRecovery) || b.change.san - a.change.san || b.change.hp - a.change.hp || b.change.progress - a.change.progress;
    })[0].choice;
  }

  return ranked.sort((a, b) => {
    const score = (item) => item.change.progress * 8 + item.change.hp * 0.8 + item.change.san * 0.5 + item.change.atk * 1.5 + item.change.def * 1.5;
    return score(b) - score(a);
  })[0].choice;
}

function emptyOutput(choice) {
  return {
    schema_version: 'round_event_v1',
    story: { title: 'Simulation', body: 'A deterministic balance simulation event.' },
    resolution: { summary: 'The planned action resolves.', event_type: 'normal' },
    hidden_state_updates: { progress: 0, key_clues: [], allies: [], injuries: [], flags: [], major_choices: [] },
    story_arc_updates: undefined,
    choices: [choice, choice, choice]
  };
}

function run(world, strategy, seed, recoveryThreshold) {
  let game = createInitialGameState(world, String(seed));
  let drought = 0;
  let maxRecoveryDrought = 0;
  let wastedHealing = 0;
  let noSafeChoiceAtDeath = false;
  const picked = {};
  let choices = createPlannedChoices({ round: game.round, language: game.language, worldId: world.id,
    stats: game.player_stats, progress: 0, runSeed: game.run_seed, community: game.community });
  const history = [];

  while (game.status === 'playing' && game.round <= 100) {
    assert.deepEqual(choices.map((choice) => choice.id), ['A', 'B', 'C']);
    const healingAvailable = choices.some((choice) => (choice.plan.stat_changes.hp ?? 0) > 0);
    drought = healingAvailable ? 0 : drought + 1;
    maxRecoveryDrought = Math.max(maxRecoveryDrought, drought);
    const choice = choose(game, choices, strategy, recoveryThreshold);
    picked[choice.plan.risk_label] = (picked[choice.plan.risk_label] ?? 0) + 1;
    wastedHealing += Math.max(0, (choice.plan.stat_changes.hp ?? 0) - (100 - game.player_stats.hp));
    const nextChoices = planNextChoices(game, choice);
    const dying = previewChoiceResult(game, choice).nextStats.hp <= 0;
    if (dying) noSafeChoiceAtDeath = choices.every((candidate) => previewChoiceResult(game, candidate).nextStats.hp <= 0);
    const result = applyRoundOutput(game, emptyOutput(choice), choice);
    game = result.nextGame;
    choices = nextChoices;
    history.push({ round: game.round, hp: game.player_stats.hp, san: game.player_stats.san, progress: game.hidden_state.progress });
  }

  return {
    world: world.id,
    language: world.language,
    seed, recoveryThreshold, maxRecoveryDrought, wastedHealing, noSafeChoiceAtDeath, picked,
    strategy,
    ending: game.finale_context?.kind ?? (game.status === 'failed' ? 'death' : 'playing'),
    status: game.status,
    endRound: game.round,
    hp: game.player_stats.hp,
    san: game.player_stats.san,
    atk: game.player_stats.atk,
    def: game.player_stats.def,
    progress: game.hidden_state.progress,
    history
  };
}

const rows = [];
const seedCount = 50;
for (const strategy of strategies) for (const recoveryThreshold of [25, 40]) {
  for (const world of getWorlds('en')) for (let seed = 0; seed < seedCount; seed++) {
    const en = run(world, strategy, seed, recoveryThreshold);
    const zhWorld = getWorlds('zh').find((candidate) => candidate.id === world.id);
    const zh = run(zhWorld, strategy, seed, recoveryThreshold);
    assert.deepEqual(zh.history, en.history, 'Language changed the numeric route');
    rows.push(en, zh);
  }
}
const summaries = [];
for (const strategy of strategies) for (const recoveryThreshold of [25, 40]) {
  // Chinese mirrors English by assertion; do not count it as an independent balance sample.
  const group = rows.filter((row) => row.strategy === strategy && row.recoveryThreshold === recoveryThreshold && row.language === 'en');
  const average = (key) => Number((group.reduce((sum, row) => sum + row[key], 0) / group.length).toFixed(2));
  const endings = Object.fromEntries([...new Set(group.map((row) => row.ending))]
    .map((ending) => [ending, group.filter((row) => row.ending === ending).length]));
  const summary = { strategy, recoveryThreshold, runs: group.length, averageEndRound: average('endRound'),
    averageProgress: average('progress'), averageHp: average('hp'), averageSan: average('san'),
    averageMaxRecoveryDrought: average('maxRecoveryDrought'), averageWastedHealing: average('wastedHealing'),
    deathsWithoutSafeChoice: group.filter((row) => row.noSafeChoiceAtDeath).length, endings };
  summaries.push(summary);
  console.log(JSON.stringify(summary));
}
mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
writeFileSync(new URL('../output/balance-review-results.json', import.meta.url), JSON.stringify({
  note: '4800 deterministic simulations; 2400 English trajectories plus Chinese parity checks. Uses hidden numeric plans, not real players. No model-generated clues, so perfect endings are not measured.',
  seedCount, summaries, runs: rows.map(({ history, ...row }) => row)
}, null, 2));
