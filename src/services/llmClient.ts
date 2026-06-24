const MODEL = import.meta.env.VITE_OPENAI_COMPAT_MODEL || 'gpt-5.5';
const ENDPOINT = '/api/openai/chat/completions';

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
};

export async function chatCompletion(
  messages: ChatMessage[],
  signal?: AbortSignal,
  onContent?: (content: string) => void,
  options: ChatCompletionOptions = {}
) {
  const stream = options.stream ?? true;
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

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    if (options.responseFormat && options.retryWithoutResponseFormat) {
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
    return String(content).trim();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        const delta = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content ?? '';
        content += delta;
        if (delta) onContent?.(content);
      } catch {
        // Ignore malformed stream fragments; final schema validation handles bad content.
      }
    }
  }

  return content.trim();
}
