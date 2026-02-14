import { supabase } from '@/lib/supabase';

type UploadParams = {
  bucket: 'images' | 'files';
  sourceUrl: string;
  userId: string;
  folder: string;
};

type UploadLocalParams = {
  bucket: 'images' | 'files';
  fileUri: string;
  userId: string;
  folder: string;
  fileName?: string;
  contentType?: string | null;
};

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function extensionFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,8})$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extensionFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  const match = normalized.match(/\.([a-z0-9]{2,8})$/);
  return match?.[1] ?? null;
}

function extensionFromContentType(contentType: string | null): string {
  const value = (contentType || '').toLowerCase();
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('gif')) return 'gif';
  if (value.includes('pdf')) return 'pdf';
  if (value.includes('zip')) return 'zip';
  if (value.includes('text/plain')) return 'txt';
  if (value.includes('msword')) return 'doc';
  if (value.includes('officedocument.wordprocessingml')) return 'docx';
  if (value.includes('officedocument.spreadsheetml')) return 'xlsx';
  if (value.includes('officedocument.presentationml')) return 'pptx';
  return 'bin';
}

export function isSupabaseBucketPublicUrl(value: string, bucket: 'images' | 'files'): boolean {
  const normalized = value.trim();
  return normalized.includes(`/storage/v1/object/public/${bucket}/`);
}

export async function uploadRemoteAssetToBucket({
  bucket,
  sourceUrl,
  userId,
  folder,
}: UploadParams): Promise<string> {
  const url = sourceUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("L'upload vers Supabase attend une URL http(s) valide.");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de telecharger le fichier source (${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
  const extension = extensionFromUrl(url) ?? extensionFromContentType(contentType);
  const objectPath = `${folder}/${userId}/${Date.now()}-${createUuid()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, blob, {
    upsert: false,
    contentType,
  });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error("Impossible d'obtenir l'URL publique du fichier.");
  }

  return data.publicUrl;
}

export async function uploadLocalAssetToBucket({
  bucket,
  fileUri,
  userId,
  folder,
  fileName,
  contentType,
}: UploadLocalParams): Promise<string> {
  const uri = fileUri.trim();
  if (!uri) {
    throw new Error('Fichier local introuvable.');
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Impossible de lire le fichier local (${response.status}).`);
  }

  const blob = await response.blob();
  const resolvedContentType = contentType || blob.type || 'application/octet-stream';
  const extension =
    extensionFromName(fileName)
    ?? extensionFromName(uri)
    ?? extensionFromContentType(resolvedContentType);
  const objectPath = `${folder}/${userId}/${Date.now()}-${createUuid()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, blob, {
    upsert: false,
    contentType: resolvedContentType,
  });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error("Impossible d'obtenir l'URL publique du fichier.");
  }

  return data.publicUrl;
}
