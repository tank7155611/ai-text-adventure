import type { z } from 'zod';
import {
  buildCompletionFinalePrompt,
  buildFailureFinalePrompt,
  buildJsonRepairPrompt,
  buildOpeningControlPrompt,
  buildOpeningStoryPrompt,
  buildRoundControlPrompt,
  buildRoundStoryPrompt
} from './prompts';
import { controlOutputSchema, finaleOutputSchema } from './schemas';
import type { FinaleOutput, GameState, ModelControlOutput, ModelRoundOutput, Story, WorldDefinition } from './types';
import { chatCompletion } from '../services/llmClient';
import { extractPartialJsonStringField, isJsonStringFieldClosed, parseJsonObject } from '../utils/json';

export type StreamPreview = {
  title?: string;
  body?: string;
  bodyComplete?: boolean;
};

const controlJsonOptions = {
  stream: false,
  temperature: 0,
  maxTokens: 1200,
  responseFormat: 'json_object' as const,
  retryWithoutResponseFormat: true
};

const repairJsonOptions = {
  stream: false,
  temperature: 0,
  maxTokens: 1600,
  responseFormat: 'json_object' as const,
  retryWithoutResponseFormat: true
};

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:text)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseStoryText(rawText: string): Story {
  const normalized = stripFences(rawText).replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim());
  const firstLine = firstMeaningfulIndex >= 0 ? lines[firstMeaningfulIndex].trim() : '';
  const title = (firstLine.replace(/^#+\s*/, '').replace(/^标题[:：]\s*/, '').trim() || '未命名章节').slice(0, 40);
  const bodyLines = lines.slice(firstMeaningfulIndex + 1);
  const body = bodyLines
    .filter((line, index) => !(index === 0 && /^正文[:：]?\s*$/.test(line.trim())))
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
  signal?: AbortSignal
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
    buildJsonRepairPrompt(rawText, repairKind, validationError),
    signal,
    undefined,
    repairJsonOptions
  );
  try {
    const second = schema.safeParse(parseJsonObject(repaired));
    if (second.success) return second.data;
  } catch {
    // Fall through to the unified error below.
  }

  throw new Error('AI 返回 JSON 结构不符合要求，自动修复也失败。');
}

function combineRoundOutput(story: Story, control: ModelControlOutput): ModelRoundOutput {
  return {
    ...control,
    schema_version: 'round_event_v1',
    story
  };
}

export async function generateOpeningStoryStream(
  world: WorldDefinition,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<Story> {
  const rawText = await chatCompletion(buildOpeningStoryPrompt(world), signal, makeStoryPreviewHandler(onPreview));
  const story = parseStoryText(rawText);
  onPreview?.({ ...story, bodyComplete: true });
  return story;
}

export async function generateOpeningControl(
  world: WorldDefinition,
  story: Story,
  signal?: AbortSignal
): Promise<ModelControlOutput> {
  const rawText = await chatCompletion(buildOpeningControlPrompt(world, story), signal, undefined, controlJsonOptions);
  return parseWithRepair(rawText, controlOutputSchema, 'control', signal);
}

export async function generateOpeningStream(
  world: WorldDefinition,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<ModelRoundOutput> {
  const story = await generateOpeningStoryStream(world, signal, onPreview);
  const control = await generateOpeningControl(world, story, signal);
  return combineRoundOutput(story, control);
}

export async function generateRoundStoryStream(
  game: GameState,
  choiceText: string,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<Story> {
  const rawText = await chatCompletion(buildRoundStoryPrompt(game, choiceText), signal, makeStoryPreviewHandler(onPreview));
  const story = parseStoryText(rawText);
  onPreview?.({ ...story, bodyComplete: true });
  return story;
}

export async function generateRoundControl(
  game: GameState,
  choiceText: string,
  story: Story,
  signal?: AbortSignal
): Promise<ModelControlOutput> {
  const rawText = await chatCompletion(buildRoundControlPrompt(game, choiceText, story), signal, undefined, controlJsonOptions);
  return parseWithRepair(rawText, controlOutputSchema, 'control', signal);
}

export async function generateRoundStream(
  game: GameState,
  choiceText: string,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<ModelRoundOutput> {
  const story = await generateRoundStoryStream(game, choiceText, signal, onPreview);
  const control = await generateRoundControl(game, choiceText, story, signal);
  return combineRoundOutput(story, control);
}

export async function generateFailureFinaleStream(
  game: GameState,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildFailureFinalePrompt(game), signal, makeFinalePreviewHandler(onPreview));
  return parseWithRepair(rawText, finaleOutputSchema, 'finale', signal);
}

export async function generateCompletionFinaleStream(
  game: GameState,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildCompletionFinalePrompt(game), signal, makeFinalePreviewHandler(onPreview));
  return parseWithRepair(rawText, finaleOutputSchema, 'finale', signal);
}
