import type { z } from 'zod';
import {
  buildFinalePrompt,
  buildJsonRepairPrompt,
  buildOpeningControlPrompt,
  buildOpeningStoryPrompt,
  buildRoundControlPrompt,
  buildRoundStoryPrompt
} from './prompts';
import { controlOutputSchema, finaleOutputSchema } from './schemas';
import type { Choice, EndingContext, FinaleOutput, GameState, Language, ModelControlOutput, Story, WorldDefinition } from './types';
import { chatCompletion } from '../services/llmClient';
import { extractPartialJsonStringField, isJsonStringFieldClosed, parseJsonObject } from '../utils/json';

export type StreamPreview = {
  title?: string;
  body?: string;
  bodyComplete?: boolean;
};

const CONTROL_REQUEST_TIMEOUT_MS = 45_000;

function controlJsonOptions(timeoutMs = CONTROL_REQUEST_TIMEOUT_MS) {
  return {
    stream: false,
    temperature: 0,
    maxTokens: 1200,
    responseFormat: 'json_object' as const,
    retryWithoutResponseFormat: true,
    timeoutMs
  };
}

function repairJsonOptions(timeoutMs = CONTROL_REQUEST_TIMEOUT_MS) {
  return {
    stream: false,
    temperature: 0,
    maxTokens: 1600,
    responseFormat: 'json_object' as const,
    retryWithoutResponseFormat: true,
    timeoutMs
  };
}

const storyOptions = {
  stream: false,
  temperature: 0.8,
  maxTokens: 4096,
  timeoutMs: 90_000
};

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:text)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseStoryText(rawText: string): Story {
  if (!rawText.trim()) throw new Error('AI 返回了空白剧情，请重试。');
  const normalized = stripFences(rawText).replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim());
  const firstLine = firstMeaningfulIndex >= 0 ? lines[firstMeaningfulIndex].trim() : '';
  const title = (
    firstLine
      .replace(/^#+\s*/, '')
      .replace(/^(标题|Title)[:：]\s*/i, '')
      .trim() || '未命名章节'
  ).slice(0, 80);
  const bodyLines = lines.slice(firstMeaningfulIndex + 1);
  const firstBodyContentIndex = bodyLines.findIndex((line) => line.trim());
  const body = bodyLines
    .filter(
      (line, index) =>
        !(index === firstBodyContentIndex && /^(正文|Body)[:：]?\s*$/i.test(line.trim()))
    )
    .join('\n')
    .trim();

  return {
    title,
    body: body || normalized.replace(firstLine, '').trim() || normalized
  };
}

function makeStoryPreviewHandler(onPreview?: (preview: StreamPreview) => void) {
  if (!onPreview) return undefined;

  return (rawText: string) => {
    const story = parseStoryText(rawText);
    onPreview({ ...story, bodyComplete: false });
  };
}

function makeFinalePreviewHandler(onPreview?: (preview: StreamPreview) => void) {
  if (!onPreview) return undefined;

  return (rawText: string) => {
    const title = extractPartialJsonStringField(rawText, 'title');
    const body = extractPartialJsonStringField(rawText, 'finale_story');
    const bodyComplete = isJsonStringFieldClosed(rawText, 'finale_story');
    if (title || body) onPreview({ title, body, bodyComplete });
  };
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}

async function parseWithRepair<T>(
  rawText: string,
  schema: z.ZodType<T>,
  repairKind: 'control' | 'finale',
  language: Language,
  signal?: AbortSignal,
  timeoutMs = CONTROL_REQUEST_TIMEOUT_MS
) {
  let validationError = '未知错误';

  try {
    const parsed = parseJsonObject(rawText);
    const first = schema.safeParse(parsed);
    if (first.success) return first.data;
    validationError = formatZodError(first.error);
  } catch {
    validationError = 'JSON 解析失败：返回内容不是合法 JSON 对象，或存在多余文本、缺失括号、缺失引号、非法逗号。';
  }

  const repaired = await chatCompletion(
    buildJsonRepairPrompt(rawText, repairKind, validationError, language),
    signal,
    undefined,
    repairJsonOptions(timeoutMs)
  );
  try {
    const second = schema.safeParse(parseJsonObject(repaired));
    if (second.success) return second.data;
  } catch {
    // Fall through to the unified error below.
  }

  throw new Error('AI 返回 JSON 结构不符合要求，自动修复也失败。');
}

function mergePlannedChoiceText(
  control: Omit<ModelControlOutput, 'choices'> & { choices: Array<Pick<Choice, 'id' | 'text'>> },
  plannedChoices: Choice[]
): ModelControlOutput {
  return {
    ...control,
    choices: plannedChoices.map((plannedChoice) => {
      const generated = control.choices.find((choice) => choice.id === plannedChoice.id);
      return {
        ...plannedChoice,
        text: generated?.text?.trim() || plannedChoice.text
      };
    })
  };
}

export async function generateOpeningStoryStream(
  world: WorldDefinition,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<Story> {
  const rawText = await chatCompletion(buildOpeningStoryPrompt(world), signal, makeStoryPreviewHandler(onPreview), { ...storyOptions, stream: true });
  const story = parseStoryText(rawText);
  onPreview?.({ ...story, bodyComplete: true });
  return story;
}

export async function generateOpeningStory(world: WorldDefinition, signal?: AbortSignal): Promise<Story> {
  const rawText = await chatCompletion(buildOpeningStoryPrompt(world), signal, undefined, storyOptions);
  return parseStoryText(rawText);
}

export async function generateOpeningControl(
  world: WorldDefinition,
  story: Story,
  plannedChoices: Choice[],
  signal?: AbortSignal,
  timeoutMs = CONTROL_REQUEST_TIMEOUT_MS
): Promise<ModelControlOutput> {
  const rawText = await chatCompletion(
    buildOpeningControlPrompt(world, story, plannedChoices),
    signal,
    undefined,
    controlJsonOptions(timeoutMs)
  );
  const control = await parseWithRepair(rawText, controlOutputSchema, 'control', world.language, signal, timeoutMs);
  return mergePlannedChoiceText(control, plannedChoices);
}

export async function generateRoundStoryStream(
  game: GameState,
  selectedChoice: Choice,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<Story> {
  const rawText = await chatCompletion(
    buildRoundStoryPrompt(game, selectedChoice),
    signal,
    makeStoryPreviewHandler(onPreview),
    { ...storyOptions, stream: true }
  );
  const story = parseStoryText(rawText);
  onPreview?.({ ...story, bodyComplete: true });
  return story;
}

export async function generateRoundStory(
  game: GameState,
  selectedChoice: Choice,
  signal?: AbortSignal
): Promise<Story> {
  const rawText = await chatCompletion(
    buildRoundStoryPrompt(game, selectedChoice),
    signal,
    undefined,
    storyOptions
  );
  return parseStoryText(rawText);
}

export async function generateRoundControl(
  game: GameState,
  selectedChoice: Choice,
  story: Story,
  plannedChoices: Choice[],
  signal?: AbortSignal,
  timeoutMs = CONTROL_REQUEST_TIMEOUT_MS
): Promise<ModelControlOutput> {
  const rawText = await chatCompletion(
    buildRoundControlPrompt(game, selectedChoice, story, plannedChoices),
    signal,
    undefined,
    controlJsonOptions(timeoutMs)
  );
  const control = await parseWithRepair(rawText, controlOutputSchema, 'control', game.language, signal, timeoutMs);
  return mergePlannedChoiceText(control, plannedChoices);
}

export async function generateFinaleStream(
  game: GameState,
  ending: EndingContext,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildFinalePrompt(game, ending), signal, makeFinalePreviewHandler(onPreview), { ...storyOptions, stream: true });
  const schema = finaleOutputSchema.refine((finale) => finale.ending_kind === ending.kind, {
    path: ['ending_kind'], message: `ending_kind must be ${ending.kind}; keep the story consistent with this ending`
  });
  return parseWithRepair(rawText, schema, 'finale', game.language, signal);
}
