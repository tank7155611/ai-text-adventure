import type { z } from 'zod';
import {
  buildCompletionFinalePrompt,
  buildFailureFinalePrompt,
  buildJsonRepairPrompt,
  buildOpeningPrompt,
  buildRoundPrompt
} from './prompts';
import { finaleOutputSchema, roundOutputSchema } from './schemas';
import type { FinaleOutput, GameState, ModelRoundOutput, WorldDefinition } from './types';
import { chatCompletion } from '../services/llmClient';
import { extractPartialJsonStringField, isJsonStringFieldClosed, parseJsonObject } from '../utils/json';

export type StreamPreview = {
  title?: string;
  body?: string;
  bodyComplete?: boolean;
};

function makeRoundPreviewHandler(onPreview?: (preview: StreamPreview) => void) {
  if (!onPreview) return undefined;

  return (rawText: string) => {
    const title = extractPartialJsonStringField(rawText, 'title');
    const body = extractPartialJsonStringField(rawText, 'body');
    const bodyComplete = isJsonStringFieldClosed(rawText, 'body');
    if (title || body) onPreview({ title, body, bodyComplete });
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

async function parseWithRepair<T>(
  rawText: string,
  schema: z.ZodType<T>,
  repairKind: 'round' | 'finale',
  signal?: AbortSignal
) {
  try {
    const first = schema.safeParse(parseJsonObject(rawText));
    if (first.success) return first.data;
  } catch {
    // Parse failures still get one structured repair attempt.
  }

  const repaired = await chatCompletion(buildJsonRepairPrompt(rawText, repairKind), signal);
  try {
    const second = schema.safeParse(parseJsonObject(repaired));
    if (second.success) return second.data;
  } catch {
    // Fall through to the unified error below.
  }

  throw new Error('AI 返回 JSON 结构不符合要求，自动修复也失败。');
}

export async function generateOpening(world: WorldDefinition, signal?: AbortSignal): Promise<ModelRoundOutput> {
  const rawText = await chatCompletion(buildOpeningPrompt(world), signal);
  return parseWithRepair(rawText, roundOutputSchema, 'round', signal);
}

export async function generateOpeningStream(
  world: WorldDefinition,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<ModelRoundOutput> {
  const rawText = await chatCompletion(buildOpeningPrompt(world), signal, makeRoundPreviewHandler(onPreview));
  return parseWithRepair(rawText, roundOutputSchema, 'round', signal);
}

export async function generateRound(
  game: GameState,
  choiceText: string,
  signal?: AbortSignal
): Promise<ModelRoundOutput> {
  const rawText = await chatCompletion(buildRoundPrompt(game, choiceText), signal);
  return parseWithRepair(rawText, roundOutputSchema, 'round', signal);
}

export async function generateRoundStream(
  game: GameState,
  choiceText: string,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<ModelRoundOutput> {
  const rawText = await chatCompletion(buildRoundPrompt(game, choiceText), signal, makeRoundPreviewHandler(onPreview));
  return parseWithRepair(rawText, roundOutputSchema, 'round', signal);
}

export async function generateFailureFinale(game: GameState, signal?: AbortSignal): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildFailureFinalePrompt(game), signal);
  return parseWithRepair(rawText, finaleOutputSchema, 'finale', signal);
}

export async function generateFailureFinaleStream(
  game: GameState,
  signal?: AbortSignal,
  onPreview?: (preview: StreamPreview) => void
): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildFailureFinalePrompt(game), signal, makeFinalePreviewHandler(onPreview));
  return parseWithRepair(rawText, finaleOutputSchema, 'finale', signal);
}

export async function generateCompletionFinale(game: GameState, signal?: AbortSignal): Promise<FinaleOutput> {
  const rawText = await chatCompletion(buildCompletionFinalePrompt(game), signal);
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
