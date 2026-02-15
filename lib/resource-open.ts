import type { Resource } from '@/types/supabase';

type ResourceLike = Pick<Resource, 'type' | 'content' | 'file_url'>;

function normalizeCandidate(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i);
  if (!match) return null;

  const cleaned = match[1].replace(/[),.;]+$/g, '');
  return normalizeCandidate(cleaned);
}

export function getResourceExternalUrl(resource: ResourceLike): string | null {
  const candidates =
    resource.type === 'link'
      ? [normalizeCandidate(resource.content), extractFirstUrl(resource.content), normalizeCandidate(resource.file_url)]
      : [normalizeCandidate(resource.file_url), extractFirstUrl(resource.content), normalizeCandidate(resource.content)];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}
