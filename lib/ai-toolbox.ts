import { askAssistant } from '@/lib/ai-assistant';
import type { Resource, Task } from '@/types/supabase';

export const AI_INTERNET_UNAVAILABLE_MESSAGE = 'Connexion internet indisponible.';

export type AiFeatureId =
  | 'task_breakdown'
  | 'auto_prioritization'
  | 'weekly_planning'
  | 'notes_rewrite'
  | 'quiz_generator'
  | 'duplicate_detection'
  | 'focus_coach'
  | 'smart_reminders'
  | 'semantic_search'
  | 'progress_feedback'
  | 'title_tag_suggestion'
  | 'exam_mode'
  | 'simplify_document'
  | 'translate_rephrase'
  | 'anti_procrastination';

type AiToolboxInput = {
  featureId: AiFeatureId;
  input: string;
  locale?: string;
  tasks?: Task[];
  resources?: Resource[];
  preferOnline?: boolean;
};

export type AiToolboxResult = {
  text: string;
  mode: 'online' | 'offline';
  fallbackReason?: string;
};

function compactTask(task: Task): string {
  return `${task.title} | status=${task.status} | prio=${task.priority} | due=${task.due_date ?? 'none'}`;
}

function compactResource(resource: Resource): string {
  return `${resource.title} | type=${resource.type ?? 'note'} | tags=${(resource.tags ?? []).join(', ')}`;
}

function buildOnlinePrompt(input: AiToolboxInput): string {
  const locale = input.locale?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const taskContext = (input.tasks ?? []).slice(0, 40).map(compactTask).join('\n');
  const resourceContext = (input.resources ?? []).slice(0, 40).map(compactResource).join('\n');

  const instructionByFeature: Record<AiFeatureId, string> = {
    task_breakdown:
      'Break down the objective into small actionable tasks with estimated effort and suggested order.',
    auto_prioritization:
      'Prioritize current tasks by urgency and impact. Return the top priorities with reasons.',
    weekly_planning:
      'Generate a practical 7-day study plan using task due dates and workload balance.',
    notes_rewrite:
      'Rewrite notes to be clearer for revision: concise structure, bullet points, and key terms.',
    quiz_generator:
      'Create a short revision quiz (5-10 questions) with answers from the provided content.',
    duplicate_detection:
      'Detect likely duplicates among tasks/resources and explain why they match.',
    focus_coach:
      'Provide a pre-focus plan and a post-focus review template.',
    smart_reminders:
      'Generate smart reminder messages based on overdue and upcoming work.',
    semantic_search:
      'Given the query, return the most relevant tasks/resources with brief reasons.',
    progress_feedback:
      'Summarize progress, blockers, and next best actions.',
    title_tag_suggestion:
      'Suggest a strong title and useful tags for the given content.',
    exam_mode:
      'Generate an exam revision plan with milestones (J-7, J-3, J-1 style).',
    simplify_document:
      'Simplify the text for easier understanding while preserving meaning.',
    translate_rephrase:
      'Translate and/or rephrase the user text according to explicit request in input.',
    anti_procrastination:
      'Create a short anti-procrastination action plan in 10-minute chunks.',
  };

  const languageConstraint = locale === 'fr' ? 'Respond in French.' : 'Respond in English.';

  return [
    `${instructionByFeature[input.featureId]} ${languageConstraint}`,
    'Keep response concise and practical.',
    '',
    `User input:\n${input.input || '(empty)'}`,
    '',
    `Tasks context:\n${taskContext || '(none)'}`,
    '',
    `Resources context:\n${resourceContext || '(none)'}`,
  ].join('\n');
}

function isNetworkIssue(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '').toLowerCase();
  return (
    message.includes('network')
    || message.includes('offline')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('unable to resolve host')
    || message.includes('connection')
    || message.includes('internet')
    || message.includes('etimedout')
  );
}

export async function runAiToolbox(input: AiToolboxInput): Promise<AiToolboxResult> {
  if (input.preferOnline === false) {
    throw new Error(AI_INTERNET_UNAVAILABLE_MESSAGE);
  }

  try {
    const prompt = buildOnlinePrompt(input);
    const answer = await askAssistant({
      prompt,
      maxOutputTokens: 700,
      temperature: 0.2,
    });

    return {
      text: answer.text,
      mode: 'online',
    };
  } catch (error) {
    if (isNetworkIssue(error)) {
      throw new Error(AI_INTERNET_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
}
