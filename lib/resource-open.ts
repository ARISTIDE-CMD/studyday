import type { Resource } from '@/types/supabase';

type ResourceLike = Pick<Resource, 'type' | 'title' | 'content' | 'file_url'>;

const bareDomainRegex =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i;

function normalizeCandidate(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (bareDomainRegex.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(
    /((?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i
  );
  if (!match) return null;

  const cleaned = match[1].replace(/[),.;]+$/g, '');
  return normalizeCandidate(cleaned);
}

export function getResourceExternalUrl(resource: ResourceLike): string | null {
  const candidates =
    resource.type === 'link'
      ? [
          normalizeCandidate(resource.content),
          extractFirstUrl(resource.content),
          normalizeCandidate(resource.file_url),
          extractFirstUrl(resource.file_url),
          normalizeCandidate(resource.title),
          extractFirstUrl(resource.title),
        ]
      : [
          normalizeCandidate(resource.file_url),
          extractFirstUrl(resource.file_url),
          extractFirstUrl(resource.content),
          normalizeCandidate(resource.content),
          extractFirstUrl(resource.title),
        ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}
