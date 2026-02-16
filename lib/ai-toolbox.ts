import { askAssistant } from '@/lib/ai-assistant';
import type { Resource, Task } from '@/types/supabase';

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

function toTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function scoreTokenOverlap(a: string, b: string): number {
  const ta = unique(toTokens(a));
  const tb = unique(toTokens(b));
  if (!ta.length || !tb.length) return 0;
  const shared = ta.filter((token) => tb.includes(token)).length;
  return shared / Math.max(ta.length, tb.length);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextDays(baseIso: string, count: number): string[] {
  const start = new Date(`${baseIso}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  return Array.from({ length: count }).map((_, index) => {
    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + index);
    return next.toISOString().slice(0, 10);
  });
}

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

function splitSentences(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function topKeywords(text: string, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const token of toTokens(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function localTaskBreakdown(input: string): string {
  const goal = input.trim() || 'objectif';
  return [
    `Objectif: ${goal}`,
    'Plan en petites etapes:',
    '1. Clarifier le resultat attendu (5 min).',
    '2. Lister les elements necessaires (10 min).',
    '3. Traiter la premiere partie la plus simple (25 min).',
    '4. Continuer par blocs de 25 min avec pause 5 min.',
    '5. Verifier, corriger et finaliser.',
  ].join('\n');
}

function localAutoPrioritization(tasks: Task[]): string {
  if (!tasks.length) return 'Aucune tache disponible a prioriser.';
  const today = todayIso();
  const scored = tasks
    .filter((task) => task.status !== 'done')
    .map((task) => {
      const due = task.due_date ?? '9999-12-31';
      let score = 0;
      if (task.priority === 'high') score += 3;
      if (task.priority === 'medium') score += 2;
      if (due < today) score += 4;
      if (due === today) score += 3;
      return { task, score };
    })
    .sort((a, b) => b.score - a.score || (a.task.due_date ?? '9999-12-31').localeCompare(b.task.due_date ?? '9999-12-31'))
    .slice(0, 8);
  return ['Priorites recommandees:', ...scored.map((item, index) => `${index + 1}. ${item.task.title} (score ${item.score})`)].join('\n');
}

function localWeeklyPlanning(tasks: Task[]): string {
  const active = tasks.filter((task) => task.status !== 'done');
  if (!active.length) return 'Aucune tache active. Semaine legere: ajoute des objectifs de progression.';
  const days = nextDays(todayIso(), 7);
  const byDay = new Map<string, string[]>();
  for (const day of days) byDay.set(day, []);

  const sorted = [...active].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));
  for (let index = 0; index < sorted.length; index += 1) {
    const targetDay = days[index % days.length];
    byDay.get(targetDay)?.push(sorted[index].title);
  }

  return [
    'Planning sur 7 jours:',
    ...days.map((day) => {
      const items = byDay.get(day) ?? [];
      if (!items.length) return `- ${day}: revision libre / rattrapage`;
      return `- ${day}: ${items.slice(0, 3).join(' | ')}`;
    }),
  ].join('\n');
}

function localNotesRewrite(input: string): string {
  const lines = splitSentences(input);
  if (!lines.length) return 'Ajoute un texte de note pour le reecrire.';
  return ['Version revisee:', ...lines.slice(0, 10).map((line) => `- ${line}`)].join('\n');
}

function localQuizGenerator(input: string): string {
  const lines = splitSentences(input);
  if (!lines.length) return 'Ajoute un contenu pour generer un quiz.';
  const items = lines.slice(0, 5);
  const questions = items.map((line, index) => {
    const words = line.split(/\s+/).filter(Boolean);
    const hidden = words[Math.floor(words.length / 2)] ?? 'mot-cle';
    const prompt = line.replace(hidden, '_____');
    return `${index + 1}. Complete: ${prompt}\n   Reponse: ${hidden}`;
  });
  return ['Mini-quiz (offline):', ...questions].join('\n');
}

function localDuplicateDetection(tasks: Task[], resources: Resource[]): string {
  const pool = [
    ...tasks.map((task) => ({ id: `task:${task.id}`, label: task.title })),
    ...resources.map((resource) => ({ id: `resource:${resource.id}`, label: resource.title })),
  ];
  const pairs: string[] = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const score = scoreTokenOverlap(pool[i].label, pool[j].label);
      if (score >= 0.7) {
        pairs.push(`- "${pool[i].label}" ~ "${pool[j].label}" (similarite ${Math.round(score * 100)}%)`);
      }
      if (pairs.length >= 10) break;
    }
    if (pairs.length >= 10) break;
  }
  if (!pairs.length) return 'Aucun doublon evident detecte localement.';
  return ['Doublons potentiels:', ...pairs].join('\n');
}

function localFocusCoach(input: string): string {
  const target = input.trim() || 'tache courante';
  return [
    `Focus sur: ${target}`,
    'Avant session (2 min):',
    '- Couper notifications',
    '- Definir sous-objectif concret',
    '- Ouvrir seulement les ressources utiles',
    'Apres session (2 min):',
    '- Noter ce qui est termine',
    '- Noter blocages',
    '- Definir prochaine action',
  ].join('\n');
}

function localSmartReminders(tasks: Task[]): string {
  const today = todayIso();
  const active = tasks.filter((task) => task.status !== 'done');
  const overdue = active.filter((task) => task.due_date && task.due_date < today);
  const todayDue = active.filter((task) => task.due_date === today);
  const tomorrow = nextDays(today, 2)[1] ?? '';
  const tomorrowDue = active.filter((task) => task.due_date === tomorrow);
  return [
    'Rappels intelligents:',
    ...overdue.slice(0, 3).map((task) => `- En retard: "${task.title}"`),
    ...todayDue.slice(0, 3).map((task) => `- A faire aujourd hui: "${task.title}"`),
    ...tomorrowDue.slice(0, 3).map((task) => `- Preparation demain: "${task.title}"`),
    ...(overdue.length + todayDue.length + tomorrowDue.length === 0 ? ['- Aucun rappel critique pour le moment.'] : []),
  ].join('\n');
}

function localSemanticSearch(query: string, tasks: Task[], resources: Resource[]): string {
  const q = query.trim();
  if (!q) return 'Entre une requete pour rechercher.';
  const candidates = [
    ...tasks.map((task) => ({ kind: 'Tache', title: task.title, extra: task.description ?? '' })),
    ...resources.map((resource) => ({ kind: 'Ressource', title: resource.title, extra: resource.content ?? '' })),
  ];
  const ranked = candidates
    .map((item) => ({
      ...item,
      score: Math.max(scoreTokenOverlap(q, item.title), scoreTokenOverlap(q, item.extra)),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!ranked.length) return 'Aucun resultat semantique local.';
  return ['Resultats semantiques:', ...ranked.map((item, index) => `${index + 1}. [${item.kind}] ${item.title}`)].join('\n');
}

function localProgressFeedback(tasks: Task[]): string {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const pending = total - done;
  const rate = total ? Math.round((done / total) * 100) : 0;
  return [
    `Progression: ${done}/${total} (${rate}%)`,
    `En attente: ${pending}`,
    'Actions recommandees:',
    '- Finir 1 tache courte aujourd hui.',
    '- Bloquer 25 min pour la tache la plus critique.',
    '- Nettoyer les taches obsoletes.',
  ].join('\n');
}

function localTitleTagSuggestion(input: string): string {
  const text = input.trim();
  if (!text) return 'Ajoute un texte pour proposer un titre et des tags.';
  const words = text.split(/\s+/).filter(Boolean);
  const title = words.slice(0, 8).join(' ');
  const tags = topKeywords(text, 6).map((token) => `#${token}`);
  return [`Titre suggere: ${title}`, `Tags: ${tags.join(' ') || '#revision #study'}`].join('\n');
}

function localExamMode(input: string, tasks: Task[]): string {
  const exam = input.trim() || 'prochain examen';
  const high = tasks.filter((task) => task.status !== 'done').slice(0, 6);
  return [
    `Mode examen: ${exam}`,
    'J-7: consolider bases + fiches synthese.',
    'J-3: exercices types + correction active.',
    'J-1: revision legere + sommeil.',
    'Priorites a couvrir:',
    ...high.map((task, index) => `${index + 1}. ${task.title}`),
  ].join('\n');
}

function localSimplifyDocument(input: string): string {
  const lines = splitSentences(input);
  if (!lines.length) return 'Ajoute un texte a simplifier.';
  return ['Version simplifiee:', ...lines.slice(0, 8).map((line) => `- ${line}`)].join('\n');
}

function localTranslateRephrase(input: string): string {
  if (!input.trim()) return 'Ajoute un texte a reformuler/traduire.';
  return [
    'Mode offline: traduction indisponible sans IA distante.',
    'Reformulation locale:',
    ...splitSentences(input)
      .slice(0, 8)
      .map((line) => `- ${line}`),
  ].join('\n');
}

function localAntiProcrastination(input: string): string {
  const target = input.trim() || 'tache bloquee';
  return [
    `Plan anti-procrastination pour: ${target}`,
    '00:00-02:00 -> ouvrir le document et definir objectif minimal',
    '02:00-10:00 -> realiser la plus petite action mesurable',
    '10:00-15:00 -> mini pause',
    '15:00-25:00 -> second sprint cible',
    '25:00-27:00 -> noter la prochaine action',
  ].join('\n');
}

function runLocalFallback(input: AiToolboxInput): string {
  const tasks = input.tasks ?? [];
  const resources = input.resources ?? [];
  switch (input.featureId) {
    case 'task_breakdown':
      return localTaskBreakdown(input.input);
    case 'auto_prioritization':
      return localAutoPrioritization(tasks);
    case 'weekly_planning':
      return localWeeklyPlanning(tasks);
    case 'notes_rewrite':
      return localNotesRewrite(input.input);
    case 'quiz_generator':
      return localQuizGenerator(input.input);
    case 'duplicate_detection':
      return localDuplicateDetection(tasks, resources);
    case 'focus_coach':
      return localFocusCoach(input.input);
    case 'smart_reminders':
      return localSmartReminders(tasks);
    case 'semantic_search':
      return localSemanticSearch(input.input, tasks, resources);
    case 'progress_feedback':
      return localProgressFeedback(tasks);
    case 'title_tag_suggestion':
      return localTitleTagSuggestion(input.input);
    case 'exam_mode':
      return localExamMode(input.input, tasks);
    case 'simplify_document':
      return localSimplifyDocument(input.input);
    case 'translate_rephrase':
      return localTranslateRephrase(input.input);
    case 'anti_procrastination':
      return localAntiProcrastination(input.input);
    default:
      return 'Fonction non disponible.';
  }
}

function shouldFallback(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '').toLowerCase();
  return (
    message.includes('network')
    || message.includes('offline')
    || message.includes('quota')
    || message.includes('upstream')
    || message.includes('invalid jwt')
    || message.includes('session')
    || message.includes('failed')
  );
}

export async function runAiToolbox(input: AiToolboxInput): Promise<AiToolboxResult> {
  const preferOnline = input.preferOnline !== false;

  if (preferOnline) {
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
      if (!shouldFallback(error)) {
        throw error;
      }
      return {
        text: runLocalFallback(input),
        mode: 'offline',
        fallbackReason: String((error as { message?: string })?.message ?? 'fallback'),
      };
    }
  }

  return {
    text: runLocalFallback(input),
    mode: 'offline',
    fallbackReason: 'offline_mode',
  };
}
