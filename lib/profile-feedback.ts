import {
  createEntityId,
  createLocalId,
  enqueueOutboxOperation,
  getLocalProfileFeedbacks,
  upsertLocalProfileFeedback,
} from '@/lib/offline-store';
import type { ProfileFeedback } from '@/types/supabase';

export async function createProfileFeedback(input: {
  userId: string;
  rating: number;
  comment: string;
}): Promise<ProfileFeedback> {
  const now = new Date().toISOString();
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const comment = input.comment.trim();

  const feedback: ProfileFeedback = {
    id: createEntityId(),
    profile_id: input.userId,
    rating,
    comment,
    created_at: now,
  };

  await upsertLocalProfileFeedback(input.userId, feedback);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'feedback',
    action: 'upsert',
    userId: input.userId,
    record: feedback,
    createdAt: now,
  });

  return feedback;
}

export async function getCachedProfileFeedbacks(userId: string): Promise<ProfileFeedback[]> {
  const feedbacks = await getLocalProfileFeedbacks(userId);
  return [...feedbacks].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}
