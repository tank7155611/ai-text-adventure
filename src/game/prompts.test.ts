import { describe, expect, it } from 'vitest';
import { buildRoundStoryPrompt, buildRoundControlPrompt, buildFinalePrompt } from './prompts';
import { createInitialGameState, planNextChoices, previewChoiceResult } from './rules';
import { getWorlds } from '../data/worlds';
import type { Choice } from './types';

describe('authoritative narrative context', () => {
  it('gives both generation stages actual capped results and preserves chapter facts', () => {
    const initial = createInitialGameState(getWorlds('en')[0], 'prompts');
    const game = { ...initial, round: 80, player_stats: { hp: 95, san: 99, atk: 30, def: 30 },
      hidden_state: { ...initial.hidden_state, progress: 70 }, chapter_memories: ['A promise made in chapter one'] };
    const choice: Choice = { id: 'A', text: 'Recover while advancing', plan: {
      risk_label: 'Tradeoff', tone: 'gain', stat_changes: { hp: 18, san: 12 }, progress: 3,
      intent: 'Recover', settlement_hint: 'Recover', checks: [] } };
    const story = { title: 'A shelter', body: 'The route is secured.' };
    for (const messages of [buildRoundStoryPrompt(game, choice),
      buildRoundControlPrompt(game, choice, story, planNextChoices(game, choice))]) {
      const prompt = messages[1].content;
      expect(prompt).toContain('Health +5');
      expect(prompt).toContain('Sanity +1');
      expect(prompt).toContain('Main progress: +2');
      expect(prompt).toContain('Authoritative resulting progress: 72');
      expect(prompt).toContain('A promise made in chapter one');
    }
    expect(previewChoiceResult(game, choice).statChanges).toEqual({ hp: 5, san: 1 });
    expect(buildFinalePrompt(game, { kind: 'standard', progress: 72, sanity: 100, clueCount: 1, unresolvedHookCount: 0 })[1].content)
      .toContain('A promise made in chapter one');
  });
});
