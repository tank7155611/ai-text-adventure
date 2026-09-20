import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Choice, ModelControlOutput, Story } from './game/types';

const ai = vi.hoisted(() => ({
  generateFinaleStream: vi.fn(),
  generateOpeningControl: vi.fn(),
  generateOpeningStory: vi.fn(),
  generateOpeningStoryStream: vi.fn(),
  generateRoundControl: vi.fn(),
  generateRoundStory: vi.fn()
}));

vi.mock('./game/ai', () => ai);

import App from './App';
import * as rules from './game/rules';

function choices(prefix: string): Choice[] {
  return (['A', 'B', 'C'] as const).map((id) => ({
    id,
    text: `${prefix} ${id}`,
    plan: {
      risk_label: 'Steady',
      tone: 'calm',
      stat_changes: { hp: -3 },
      progress: 1,
      intent: `${prefix} intent ${id}`,
      settlement_hint: `${prefix} settlement ${id}`,
      checks: []
    }
  }));
}

function control(nextChoices: Choice[]): ModelControlOutput {
  return {
    schema_version: 'round_control_v1',
    resolution: { summary: 'The route is secured.', event_type: 'exploration' },
    hidden_state_updates: {
      progress: 0,
      key_clues: [],
      allies: [],
      injuries: [],
      flags: [],
      major_choices: []
    },
    story_arc_updates: {
      current_thread: 'Continue through the passage',
      unresolved_hooks: ['The signal remains unexplained'],
      tension_level: 2,
      finale_direction: 'Reach the signal source'
    },
    choices: nextChoices
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function finishOpeningAnimation() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('App asynchronous flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    Object.values(ai).forEach((mock) => mock.mockReset());

    ai.generateOpeningStory.mockResolvedValue({
      title: 'The First Signal',
      body: 'A sealed maintenance door begins to open.'
    } satisfies Story);
    ai.generateOpeningControl.mockResolvedValue(control(choices('Opening choice')));
    ai.generateRoundStory.mockResolvedValue({
      title: 'Beyond the Door',
      body: 'The passage is difficult, but the way forward is now clear.'
    } satisfies Story);
    ai.generateRoundControl.mockResolvedValue(control(choices('Next choice')));
  });

  it('runs opening story and control stages before enabling choices', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);

    expect(screen.getByText('Streaming')).toBeInTheDocument();
    await finishOpeningAnimation();

    expect(ai.generateOpeningStory).toHaveBeenCalledTimes(1);
    expect(ai.generateOpeningControl).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Opening choice A')).toBeEnabled();
    expect(screen.getByText('A sealed maintenance door begins to open.')).toBeInTheDocument();
    const renderedStory = document.querySelector('.story-scroll')?.textContent ?? '';
    expect(renderedStory.match(/Arcane Academy\./g)).toHaveLength(1);
  });

  it('keeps the generated story and retries only control generation after a control failure', async () => {
    ai.generateRoundControl
      .mockRejectedValueOnce(new Error('control unavailable'))
      .mockResolvedValueOnce(control(choices('Recovered choice')));
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();

    fireEvent.click(screen.getByText('Opening choice A'));
    await finishOpeningAnimation();

    expect(screen.getByText('The passage is difficult, but the way forward is now clear.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regenerate Choices/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Choices/ }));
    await finishOpeningAnimation();

    expect(ai.generateRoundStory).toHaveBeenCalledTimes(1);
    expect(ai.generateRoundControl).toHaveBeenCalledTimes(2);
    expect(ai.generateRoundControl.mock.calls[0][5]).toBeUndefined();
    expect(ai.generateRoundControl.mock.calls[1][5]).toBe(90_000);
    expect(screen.getByText('Recovered choice A')).toBeEnabled();
  });

  it('uses 90 seconds when retrying opening control generation', async () => {
    ai.generateOpeningControl
      .mockRejectedValueOnce(new Error('control unavailable'))
      .mockResolvedValueOnce(control(choices('Recovered opening choice')));
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();

    expect(screen.getByRole('button', { name: /Regenerate Choices/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Regenerate Choices/ }));
    await finishOpeningAnimation();

    expect(ai.generateOpeningStory).toHaveBeenCalledTimes(1);
    expect(ai.generateOpeningControl).toHaveBeenCalledTimes(2);
    expect(ai.generateOpeningControl.mock.calls[0][4]).toBeUndefined();
    expect(ai.generateOpeningControl.mock.calls[1][4]).toBe(90_000);
    expect(screen.getByText('Recovered opening choice A')).toBeEnabled();
  });

  it('hides local fallback choices while the ordinary story is being prepared', async () => {
    const roundStory = deferred<Story>();
    const roundControl = deferred<ModelControlOutput>();
    ai.generateRoundStory.mockReturnValueOnce(roundStory.promise);
    ai.generateRoundControl.mockReturnValueOnce(roundControl.promise);

    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();

    fireEvent.click(screen.getByText('Opening choice A'));

    expect(screen.getByText('Preparing the next actions...')).toBeInTheDocument();
    const pendingChoices = screen.getAllByRole('button').filter((button) => button.className.includes('choice-button'));
    expect(pendingChoices).toHaveLength(0);

    roundStory.resolve({
      title: 'Beyond the Door',
      body: 'The passage is difficult, but the way forward is now clear.'
    });
    await act(async () => Promise.resolve());

    // Control generation starts as soon as the complete story arrives, while
    // the same story is still being revealed by the client-side animation.
    expect(ai.generateRoundControl).toHaveBeenCalledTimes(1);

    expect(screen.getByText('T')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText('The')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText((content) => content.trim() === 'The p')).toBeInTheDocument();
    roundControl.resolve(control(choices('Next choice')));
    await finishOpeningAnimation();
  });

  it('aborts an in-flight opening request when the player returns home', async () => {
    let capturedSignal: AbortSignal | undefined;
    ai.generateOpeningStory.mockImplementation((_world, signal) => {
      capturedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await act(async () => Promise.resolve());

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'AI Text Adventure' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(6);
  });
  it('keeps a new game locked when a cancelled intro finishes its timer', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[1]);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await finishOpeningAnimation();
    expect(screen.getByText('Opening choice A')).toBeInTheDocument();
  });

  it('ignores a late old control result after starting another world', async () => {
    const oldControl = deferred<ModelControlOutput>();
    ai.generateOpeningControl.mockReturnValueOnce(oldControl.promise);
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[1]);
    await act(async () => { oldControl.resolve(control(choices('Stale choice'))); });
    expect(screen.queryByText('Stale choice A')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    await finishOpeningAnimation();
    expect(screen.getByText('Opening choice A')).toBeInTheDocument();
  });

  it('handles an immediate opening failure during intro and allows retry', async () => {
    ai.generateOpeningStory.mockRejectedValueOnce(new Error('story timeout'));
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();
    expect(screen.getByRole('alert')).toHaveTextContent('story timeout');
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));
    await finishOpeningAnimation();
    expect(screen.getByText('Opening choice A')).toBeInTheDocument();
  });

  it('ignores a late ordinary story failure after a new game starts', async () => {
    const oldStory = deferred<Story>();
    ai.generateRoundStory.mockReturnValueOnce(oldStory.promise);
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();
    fireEvent.click(screen.getByText('Opening choice A'));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[1]);
    await act(async () => { oldStory.reject(new Error('Old failure')); });
    expect(screen.queryByText('Old failure')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    await finishOpeningAnimation();
  });

  it('reaches round 100 and preserves its ending label if finale generation fails', async () => {
    const create = rules.createInitialGameState;
    vi.spyOn(rules, 'createInitialGameState').mockImplementation((world) => ({ ...create(world, 'terminal'), round: 100 }));
    ai.generateFinaleStream.mockRejectedValue(new Error('finale timeout'));
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();
    fireEvent.click(screen.getByText('Opening choice A'));
    await finishOpeningAnimation();
    expect(screen.getByText('Round 100 / 100')).toBeInTheDocument();
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'View Ending' }));
    await act(async () => Promise.resolve());
    expect(document.querySelector('.ending-pill')).toHaveTextContent('Incomplete');
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
  });

  it('ignores late finale rejection after returning home and starting a new game', async () => {
    const create = rules.createInitialGameState;
    const initialSpy = vi.spyOn(rules, 'createInitialGameState').mockImplementation((world) => ({ ...create(world, 'terminal'), round: 100 }));
    const oldFinale = deferred<never>();
    ai.generateFinaleStream.mockReturnValueOnce(oldFinale.promise);
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
    await finishOpeningAnimation();
    fireEvent.click(screen.getByText('Opening choice A'));
    await finishOpeningAnimation();
    fireEvent.click(screen.getByRole('button', { name: 'View Ending' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    initialSpy.mockRestore();
    fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[1]);
    await act(async () => { oldFinale.reject(new Error('old finale timeout')); });
    expect(screen.getByText('Round 1 / 100')).toBeInTheDocument();
    expect(document.querySelectorAll('.choice-button')).toHaveLength(0);
    expect(document.querySelector('.ending-pill')).toBeNull();
    await finishOpeningAnimation();
  });

});
