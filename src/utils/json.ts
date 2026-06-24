export function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');

  if (first >= 0 && last > first) {
    return candidate.slice(first, last + 1);
  }

  return candidate;
}

export function parseJsonObject(text: string): unknown {
  return JSON.parse(extractJson(text));
}

function decodePartialJsonString(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

export function extractPartialJsonStringField(text: string, fieldName: string) {
  const key = `"${fieldName}"`;
  const keyIndex = text.indexOf(key);
  if (keyIndex < 0) return undefined;

  const colonIndex = text.indexOf(':', keyIndex + key.length);
  if (colonIndex < 0) return undefined;

  const quoteIndex = text.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return undefined;

  let escaped = false;
  let value = '';

  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') break;
    value += char;
  }

  return decodePartialJsonString(value);
}

export function isJsonStringFieldClosed(text: string, fieldName: string) {
  const key = `"${fieldName}"`;
  const keyIndex = text.indexOf(key);
  if (keyIndex < 0) return false;

  const colonIndex = text.indexOf(':', keyIndex + key.length);
  if (colonIndex < 0) return false;

  const quoteIndex = text.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return false;

  let escaped = false;

  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') return true;
  }

  return false;
}
