import * as FileSystem from 'expo-file-system/legacy';

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

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const bufferLength = Math.floor((cleaned.length * 3) / 4) - padding;
  const bytes = new Uint8Array(bufferLength);

  let byteIndex = 0;
  for (let index = 0; index < cleaned.length; index += 4) {
    const c1 = cleaned.charAt(index);
    const c2 = cleaned.charAt(index + 1);
    const c3 = cleaned.charAt(index + 2);
    const c4 = cleaned.charAt(index + 3);

    const e1 = chars.indexOf(c1);
    const e2 = chars.indexOf(c2);
    const e3 = c3 === '=' ? 0 : chars.indexOf(c3);
    const e4 = c4 === '=' ? 0 : chars.indexOf(c4);

    if (e1 < 0 || e2 < 0 || (c3 !== '=' && e3 < 0) || (c4 !== '=' && e4 < 0)) {
      throw new Error('Contenu base64 invalide.');
    }

    const chunk = (e1 << 18) | (e2 << 12) | (e3 << 6) | e4;
    const b1 = (chunk >> 16) & 255;
    const b2 = (chunk >> 8) & 255;
    const b3 = chunk & 255;

    if (byteIndex < bufferLength) bytes[byteIndex++] = b1;
    if (c3 !== '=' && byteIndex < bufferLength) bytes[byteIndex++] = b2;
    if (c4 !== '=' && byteIndex < bufferLength) bytes[byteIndex++] = b3;
  }

  return bytes.buffer;
}

async function resolveReadableLocalUri(uri: string, fileName?: string): Promise<{ uri: string; cleanup?: () => Promise<void> }> {
  if (!uri.startsWith('content://')) {
    return { uri };
  }

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) {
    return { uri };
  }

  const extension = extensionFromName(fileName) ?? 'bin';
  const targetUri = `${baseDir}upload-${Date.now()}-${createUuid()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: targetUri });

  return {
    uri: targetUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    },
  };
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
  const initialUri = fileUri.trim();
  if (!initialUri) {
    throw new Error('Fichier local introuvable.');
  }

  const readable = await resolveReadableLocalUri(initialUri, fileName);
  try {
    const base64 = await FileSystem.readAsStringAsync(readable.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileBytes = decodeBase64ToArrayBuffer(base64);

    const resolvedContentType = contentType || 'application/octet-stream';
    const extension =
      extensionFromName(fileName)
      ?? extensionFromName(readable.uri)
      ?? extensionFromContentType(resolvedContentType);
    const objectPath = `${folder}/${userId}/${Date.now()}-${createUuid()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, fileBytes, {
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
  } finally {
    if (readable.cleanup) {
      await readable.cleanup();
    }
  }
}
