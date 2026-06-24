import { z } from 'zod';

const statImpactSchema = z.enum([
  'none',
  'minor_loss',
  'medium_loss',
  'major_loss',
  'minor_gain',
  'medium_gain',
  'major_gain'
]);

const statEffectsSchema = z
  .object({
    hp: statImpactSchema,
    san: statImpactSchema,
    atk: statImpactSchema,
    def: statImpactSchema,
    reason: z.string().min(2).max(160)
  })
  .strict();

const choiceSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  text: z.string().min(2).max(80)
});

export const roundOutputSchema = z
  .object({
    schema_version: z.literal('round_event_v1'),
    story: z.object({
      title: z.string().min(2).max(40),
      body: z.string().min(40).max(2400)
    }),
    resolution: z.object({
      summary: z.string().min(2).max(300),
      event_type: z.enum(['normal', 'combat', 'discovery', 'danger', 'rest', 'twist'])
    }),
    stat_effects: statEffectsSchema,
    hidden_state_updates: z
      .object({
        progress: z.number().int().min(-10).max(20).optional(),
        key_clues: z.array(z.string().min(1).max(40)).max(5).optional(),
        allies: z.array(z.string().min(1).max(40)).max(5).optional(),
        injuries: z.array(z.string().min(1).max(40)).max(5).optional(),
        flags: z.array(z.string().min(1).max(40)).max(5).optional(),
        major_choices: z.array(z.string().min(1).max(80)).max(5).optional()
      })
      .strict(),
    story_arc_updates: z
      .object({
        main_goal: z.string().min(2).max(120).optional(),
        current_thread: z.string().min(2).max(160).optional(),
        unresolved_hooks: z.array(z.string().min(1).max(80)).max(8).optional(),
        tension_level: z.number().int().min(1).max(5).optional(),
        finale_direction: z.string().min(2).max(160).optional()
      })
      .strict()
      .optional(),
    choices: z.array(choiceSchema).length(3)
  })
  .strict();

export const finaleOutputSchema = z
  .object({
    schema_version: z.union([z.literal('failure_finale_v1'), z.literal('completion_finale_v1')]),
    title: z.string().min(2).max(40),
    finale_story: z.string().min(80).max(2600)
  })
  .strict();

export type RoundOutputSchema = z.infer<typeof roundOutputSchema>;
export type FinaleOutputSchema = z.infer<typeof finaleOutputSchema>;
