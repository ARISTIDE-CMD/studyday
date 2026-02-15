import { markReminderSent, shouldSendReminder } from '@/lib/reminder-state';
import type { Task } from '@/types/supabase';

const REMINDER_COOLDOWN_MS = 18 * 60 * 60 * 1000;
const MAX_REMINDERS_PER_RUN = 3;

type ReminderTranslator = (key: string, params?: Record<string, string | number>) => string;

export type TaskReminder = {
  taskId: string;
  title: string;
  message: string;
};

type Candidate = {
  reminderKey: string;
  taskId: string;
  title: string;
  message: string;
  priorityRank: number;
  dueRank: number;
};

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffsetIso(base: Date, offset: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

function getPriorityRank(priority: Task['priority']): number {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function buildCandidates(tasks: Task[], t: ReminderTranslator): Candidate[] {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const tomorrowIso = dayOffsetIso(today, 1);

  const candidates: Candidate[] = [];

  for (const task of tasks) {
    if (task.status === 'done') continue;
    if (!task.due_date) continue;

    if (task.due_date < todayIso) {
      candidates.push({
        reminderKey: `${task.id}:overdue:${task.due_date}`,
        taskId: task.id,
        title: t('reminders.overdueTitle'),
        message: t('reminders.overdueMessage', { title: task.title }),
        priorityRank: getPriorityRank(task.priority),
        dueRank: 0,
      });
      continue;
    }

    if (task.due_date === todayIso) {
      candidates.push({
        reminderKey: `${task.id}:today:${task.due_date}`,
        taskId: task.id,
        title: t('reminders.dueTodayTitle'),
        message: t('reminders.dueTodayMessage', { title: task.title }),
        priorityRank: getPriorityRank(task.priority),
        dueRank: 1,
      });
      continue;
    }

    if (task.due_date === tomorrowIso) {
      candidates.push({
        reminderKey: `${task.id}:tomorrow:${task.due_date}`,
        taskId: task.id,
        title: t('reminders.dueTomorrowTitle'),
        message: t('reminders.dueTomorrowMessage', { title: task.title }),
        priorityRank: getPriorityRank(task.priority),
        dueRank: 2,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.dueRank !== b.dueRank) return a.dueRank - b.dueRank;
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return a.taskId.localeCompare(b.taskId);
  });

  return candidates;
}

export async function collectDueTaskReminders(
  userId: string,
  tasks: Task[],
  t: ReminderTranslator
): Promise<TaskReminder[]> {
  const candidates = buildCandidates(tasks, t);
  const reminders: TaskReminder[] = [];

  for (const candidate of candidates) {
    if (reminders.length >= MAX_REMINDERS_PER_RUN) break;

    const canSend = await shouldSendReminder(userId, candidate.reminderKey, REMINDER_COOLDOWN_MS);
    if (!canSend) continue;

    await markReminderSent(userId, candidate.reminderKey);
    reminders.push({
      taskId: candidate.taskId,
      title: candidate.title,
      message: candidate.message,
    });
  }

  return reminders;
}
