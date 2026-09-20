import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Choice } from './types';

const chatCompletion = vi.hoisted(() => vi.fn());

vi.mock('../services/llmClient', () => ({ chatCompletion }));

import {
  generateFinaleStream,
  generateOpeningStory,
  generateOpeningStoryStream,
  generateRoundControl,
  generateRoundStory
} from './ai';
import { getWorlds } from '../data/worlds';
import { createInitialGameState } from './rules';

function plannedChoices(): Choice[] {
  return (['A', 'B', 'C'] as const).map((id) => ({
    id,
    text: `Fallback action ${id}`,
    plan: {
      risk_label: 'Steady',
      tone: 'calm',
      stat_changes: { hp: -3 },
      progress: 1,
      intent: `Intent ${id}`,
      settlement_hint: `Settlement ${id}`,
      checks: []
    }
  }));
}

const validControl = JSON.stringify({
  schema_version: 'round_control_v1',
  resolution: { summary: 'The sealed route opens.', event_type: 'exploration' },
  hidden_state_updates: {
    progress: 0,
    key_clues: ['etched coordinates'],
    allies: [],
    injuries: [],
    flags: [],
    major_choices: []
  },
  story_arc_updates: {
    current_thread: 'Follow the coordinates',
    unresolved_hooks: ['Who left them?'],
    tension_level: 2,
    finale_direction: 'Reach the signal source'
  },
  choices: [
    { id: 'A', text: 'Enter through the open route' },
    { id: 'B', text: 'Inspect the etched coordinates' },
    { id: 'C', text: 'Secure a path back first' }
  ]
});

describe('AI generation flow', () => {
  beforeEach(() => {
    chatCompletion.mockReset();
  });

  it('publishes streaming story previews and parses the final plain text', async () => {
    chatCompletion.mockImplementation(async (_messages, _signal, onContent) => {
      onContent?.('Title: Signal Room\n\nBody:\nThe first lock turns.');
      return 'Title: Signal Room\n\nBody:\nThe first lock turns.\n\nA second door opens.';
    });
    const previews: Array<{ title?: string; body?: string; bodyComplete?: boolean }> = [];

    const story = await generateOpeningStoryStream(getWorlds('en')[0], undefined, (preview) => previews.push(preview));

    expect(story).toEqual({
      title: 'Signal Room',
      body: 'The first lock turns.\n\nA second door opens.'
    });
    expect(previews[0]).toMatchObject({ title: 'Signal Room', bodyComplete: false });
    expect(previews.at(-1)).toMatchObject({ ...story, bodyComplete: true });
  });

  it('requests the opening story as a complete response for local paced reveal', async () => {
    chatCompletion.mockResolvedValue('Title: Prologue\n\nBody:\nThe first signal appears.');

    await expect(generateOpeningStory(getWorlds('en')[0])).resolves.toEqual({
      title: 'Prologue',
      body: 'The first signal appears.'
    });
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      expect.objectContaining({ stream: false })
    );
  });

  it('repairs invalid control JSON once and preserves every local ChoicePlan', async () => {
    chatCompletion.mockResolvedValueOnce('{ invalid json').mockResolvedValueOnce(validControl);
    const plans = plannedChoices();
    const game = createInitialGameState(getWorlds('en')[0]);

    const control = await generateRoundControl(
      game,
      plans[0],
      { title: 'Signal Room', body: 'The sealed route opens.' },
      plans
    );

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(chatCompletion.mock.calls[0][3]).toEqual(expect.objectContaining({ timeoutMs: 45_000 }));
    expect(chatCompletion.mock.calls[1][3]).toEqual(expect.objectContaining({ timeoutMs: 45_000 }));
    expect(control.choices.map((choice) => choice.text)).toEqual([
      'Enter through the open route',
      'Inspect the etched coordinates',
      'Secure a path back first'
    ]);
    expect(control.choices.map((choice) => choice.plan)).toEqual(plans.map((choice) => choice.plan));
  });

  it('uses the retry timeout for both control generation and JSON repair', async () => {
    chatCompletion.mockResolvedValueOnce('{ invalid json').mockResolvedValueOnce(validControl);
    const plans = plannedChoices();

    await generateRoundControl(
      createInitialGameState(getWorlds('en')[0]),
      plans[0],
      { title: 'Signal Room', body: 'The sealed route opens.' },
      plans,
      undefined,
      90_000
    );

    expect(chatCompletion.mock.calls[0][3]).toEqual(expect.objectContaining({ timeoutMs: 90_000 }));
    expect(chatCompletion.mock.calls[1][3]).toEqual(expect.objectContaining({ timeoutMs: 90_000 }));
  });

  it('requests ordinary story as a complete response for local paced reveal', async () => {
    chatCompletion.mockResolvedValue('Title: Signal Room\n\nBody:\nThe route opens.');
    const game = createInitialGameState(getWorlds('en')[0]);
    const choice = plannedChoices()[0];

    await expect(generateRoundStory(game, choice)).resolves.toEqual({
      title: 'Signal Room',
      body: 'The route opens.'
    });
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      expect.objectContaining({ stream: false })
    );
  });

  it('surfaces a stable error after both validation attempts fail', async () => {
    chatCompletion.mockResolvedValueOnce('not json').mockResolvedValueOnce('{"still":"wrong"}');
    const plans = plannedChoices();

    await expect(
      generateRoundControl(
        createInitialGameState(getWorlds('en')[0]),
        plans[0],
        { title: 'Broken response', body: 'The response cannot be decoded.' },
        plans
      )
    ).rejects.toThrow('AI 返回 JSON 结构不符合要求，自动修复也失败。');
  });

  it('uses the unified finale schema and keeps the frontend ending decision authoritative', async () => {
    chatCompletion.mockResolvedValue(
      JSON.stringify({
        schema_version: 'finale_v1',
        ending_kind: 'bittersweet',
        title: 'A Costly Return',
        finale_story: 'The signal falls silent, and the city survives the final turn. The people remember what was lost.'
      })
    );
    const game = {
      ...createInitialGameState(getWorlds('en')[0]),
      round: 100,
      player_stats: { hp: 40, san: 30, atk: 12, def: 8 }
    };
    const ending = {
      kind: 'bittersweet' as const,
      progress: 55,
      sanity: 30,
      clueCount: 2,
      unresolvedHookCount: 1
    };

    const finale = await generateFinaleStream(game, ending);

    expect(finale.schema_version).toBe('finale_v1');
    expect(finale.ending_kind).toBe('bittersweet');
  });
  it('repairs duplicate choice IDs instead of exposing fallback text', async () => {
    const invalid = JSON.parse(validControl);
    invalid.choices[1].id = 'A';
    chatCompletion.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(validControl);
    const plans = plannedChoices();
    const result = await generateRoundControl(createInitialGameState(getWorlds('en')[0]), plans[0],
      { title: 'A door', body: 'The door opens.' }, plans);
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.choices.map((choice) => choice.id)).toEqual(['A', 'B', 'C']);
    expect(result.choices[1].text).toBe('Inspect the etched coordinates');
  });

  it('gives opening, ordinary and finale story requests a bounded timeout', async () => {
    chatCompletion.mockResolvedValue('Title: Scene\nBody:\nThe door opens.');
    const game = createInitialGameState(getWorlds('en')[0]);
    await generateOpeningStory(game.world);
    await generateRoundStory(game, plannedChoices()[0]);
    for (const call of chatCompletion.mock.calls) expect(call[3].timeoutMs).toBe(90_000);
    chatCompletion.mockReset();
    const ending = { kind: 'death' as const, progress: 4, sanity: 10, clueCount: 0, unresolvedHookCount: 1 };
    const finale = { schema_version: 'finale_v1', ending_kind: 'death', title: 'The Last Door',
      finale_story: 'The door closes behind the final survivor. Their journey ends here, with the rescue still unfinished.' };
    chatCompletion.mockResolvedValue(JSON.stringify(finale));
    await generateFinaleStream(game, ending);
    expect(chatCompletion.mock.calls[0][3]).toMatchObject({ stream: true, timeoutMs: 90_000 });
  });

  it('repairs a mismatched ending rather than relabeling its story', async () => {
    const finale = { schema_version: 'finale_v1', ending_kind: 'perfect', title: 'The Last Door',
      finale_story: 'The door closes behind the final survivor. Their journey ends here, with the rescue still unfinished.' };
    chatCompletion.mockResolvedValueOnce(JSON.stringify(finale))
      .mockResolvedValueOnce(JSON.stringify({ ...finale, ending_kind: 'death' }));
    const result = await generateFinaleStream(createInitialGameState(getWorlds('en')[0]),
      { kind: 'death', progress: 4, sanity: 10, clueCount: 0, unresolvedHookCount: 1 });
    expect(result.ending_kind).toBe('death');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(chatCompletion.mock.calls[1][0][1].content).toContain('ending_kind must be death');
  });

});
