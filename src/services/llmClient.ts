export const MODEL = import.meta.env.VITE_OPENAI_COMPAT_MODEL || 'gpt-5.6-luna';
const ENDPOINT = '/api/openai/chat/completions';

type ConnectionStatus = 'idle' | 'requesting' | 'connected' | 'error';
let connectionStatus: ConnectionStatus = 'idle';
let latestRequest = 0;
const listeners = new Set<() => void>();
export const getConnectionStatus = () => connectionStatus;
export function subscribeConnectionStatus(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setConnectionStatus(requestId: number, status: ConnectionStatus) {
  if (requestId !== latestRequest) return;
  connectionStatus = status;
  listeners.forEach((listener) => listener());
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionOptions = {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object';
  retryWithoutResponseFormat?: boolean;
  timeoutMs?: number;
};

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  if (!timeoutMs) {
    return {
      signal,
      didTimeout: () => false,
      cleanup: () => undefined
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
  onContent?: (content: string) => void,
  options: ChatCompletionOptions = {}
) {
  const requestId = ++latestRequest;
  setConnectionStatus(requestId, 'requesting');
  const stream = options.stream ?? true;
  const requestSignal = createRequestSignal(signal, options.timeoutMs);
  const requestBody: Record<string, unknown> = {
    model: MODEL,
    stream,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 4096,
    messages
  };

  if (options.responseFormat) {
    requestBody.response_format = { type: options.responseFormat };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: requestSignal.signal
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      if (options.responseFormat && options.retryWithoutResponseFormat &&
          [400, 422].includes(response.status) && /response_format|json_object/i.test(body)) {
        requestSignal.cleanup();
        return chatCompletion(messages, signal, onContent, {
          ...options,
          responseFormat: undefined,
          retryWithoutResponseFormat: false
        });
      }
      throw new Error(`AI 请求失败：${response.status} ${body.slice(0, 240)}`);
    }

    if (!stream) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.delta?.content ?? '';
      if (!String(content).trim()) throw new Error('AI 返回了空白内容，请重试。');
      setConnectionStatus(requestId, 'connected');
      return String(content).trim();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return;

      try {
        const event = JSON.parse(data);
        const delta = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content ?? '';
        content += delta;
        if (delta) onContent?.(content);
      } catch {
        // Ignore malformed stream fragments; final schema validation handles bad content.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      lines.forEach(processLine);
    }

    // Some compatible providers close the stream without a trailing newline.
    // Flush that final complete SSE event instead of silently dropping it.
    if (buffer.trim()) processLine(buffer);

    if (!content.trim()) throw new Error('AI 返回了空白内容，请重试。');
    setConnectionStatus(requestId, 'connected');
    return content.trim();
  } catch (error) {
    setConnectionStatus(requestId, signal?.aborted ? 'idle' : 'error');
    if (requestSignal.didTimeout()) {
      const seconds = Math.ceil((options.timeoutMs ?? 0) / 1000);
      throw new Error(`AI 请求超时（${seconds} 秒），请重试。`);
    }
    throw error;
  } finally {
    requestSignal.cleanup();
  }
}
