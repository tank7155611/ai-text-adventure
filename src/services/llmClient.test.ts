import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatCompletion, getConnectionStatus } from './llmClient';

const messages = [
  { role: 'system' as const, content: 'Return a short answer.' },
  { role: 'user' as const, content: 'Continue.' }
];

function streamingResponse(chunks: string[]) {
  const encoded = chunks.map((chunk) => new TextEncoder().encode(chunk));
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          const value = encoded.shift();
          return value ? { done: false, value } : { done: true, value: undefined };
        })
      })
    },
    text: vi.fn()
  };
}

describe('OpenAI-compatible client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reassembles SSE events split across network chunks and publishes cumulative previews', async () => {
    fetchMock.mockResolvedValue(
      streamingResponse([
        'data: {"choices":[{"delta":{"content":"first "}}]}\n',
        '\ndata: {"choices":[{"delta":{"con',
        'tent":"second"}}]}\n\ndata: [DONE]\n\n'
      ])
    );
    const previews: string[] = [];

    const result = await chatCompletion(messages, undefined, (content) => previews.push(content));

    expect(result).toBe('first second');
    expect(previews).toEqual(['first ', 'first second']);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gpt-5.6-luna');
  });

  it('flushes a final SSE event when the provider closes without a newline', async () => {
    fetchMock.mockResolvedValue(
      streamingResponse(['data: {"choices":[{"delta":{"content":"final story"}}]}'])
    );

    await expect(chatCompletion(messages)).resolves.toBe('final story');
  });

  it('retries once without response_format when a compatible provider rejects it', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        body: {},
        text: vi.fn().mockResolvedValue('response_format is unsupported')
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {},
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] })
      });

    const result = await chatCompletion(messages, undefined, undefined, {
      stream: false,
      responseFormat: 'json_object',
      retryWithoutResponseFormat: true
    });

    expect(result).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.response_format).toEqual({ type: 'json_object' });
    expect(secondBody.response_format).toBeUndefined();
  });

  it('forwards AbortSignal to fetch', async () => {
    const controller = new AbortController();
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(chatCompletion(messages, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('aborts a stalled request when its configured timeout expires', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      })
    );

    const request = chatCompletion(messages, undefined, undefined, {
      stream: false,
      timeoutMs: 45_000
    });
    const rejection = expect(request).rejects.toThrow('AI 请求超时（45 秒），请重试。');

    await vi.advanceTimersByTimeAsync(45_000);
    await rejection;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('reports real request success and failure without retrying authentication errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: {},
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'ready' } }] }) });
    await chatCompletion(messages, undefined, undefined, { stream: false });
    expect(getConnectionStatus()).toBe('connected');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, body: {}, text: vi.fn().mockResolvedValue('Unauthorized') });
    await expect(chatCompletion(messages, undefined, undefined, { stream: false,
      responseFormat: 'json_object', retryWithoutResponseFormat: true })).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getConnectionStatus()).toBe('error');
  });

  it('does not let a cancelled old request replace the new connection status', async () => {
    const old = new AbortController();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const oldRequest = chatCompletion(messages, old.signal);
    const rejection = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: {},
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'new request' } }] }) });
    await chatCompletion(messages, undefined, undefined, { stream: false });
    old.abort();
    await rejection;
    expect(getConnectionStatus()).toBe('connected');
  });

});
