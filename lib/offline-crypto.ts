import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const STORAGE_KEY = 'studyday-offline-key-v1';
const ENCRYPTED_PREFIX = 'enc:v1:';
const PLAIN_PREFIX = 'plain:v1:';
const E2EE_PREFIX = 'e2ee:v1:';
const KEY_BACKUP_PREFIX = 'key-backup:v1:';
const KEY_BYTES_LENGTH = 32;
const IV_BYTES_LENGTH = 12;
const SALT_BYTES_LENGTH = 16;
const PBKDF2_ITERATIONS = 210_000;
const KEY_FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.txt`
  : null;

type EncryptionEnvelope = {
  iv: string;
  data: string;
};

type KeyBackupEnvelope = {
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
};

let cachedRawKey: Uint8Array | null = null;
let cachedCryptoKey: CryptoKey | null = null;
let loadingKeyPromise: Promise<Uint8Array | null> | null = null;

function getCryptoApi() {
  if (typeof globalThis.crypto === 'undefined') return null;
  if (typeof globalThis.crypto.getRandomValues !== 'function') return null;
  if (typeof globalThis.crypto.subtle === 'undefined') return null;
  return globalThis.crypto;
}

function hasAesSupport() {
  return getCryptoApi() !== null;
}

function toArrayBuffer(input: Uint8Array): ArrayBuffer {
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
}

function bytesToBase64(input: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < input.length; index += 3) {
    const a = input[index];
    const b = index + 1 < input.length ? input[index + 1] : 0;
    const c = index + 2 < input.length ? input[index + 2] : 0;

    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += index + 1 < input.length ? alphabet[(triple >> 6) & 0x3f] : '=';
    output += index + 2 < input.length ? alphabet[triple & 0x3f] : '=';
  }

  return output;
}

function base64ToBytes(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const output: number[] = [];

  for (let index = 0; index < cleaned.length; index += 4) {
    const c0 = cleaned[index];
    const c1 = cleaned[index + 1];
    const c2 = cleaned[index + 2];
    const c3 = cleaned[index + 3];

    const v0 = alphabet.indexOf(c0);
    const v1 = alphabet.indexOf(c1);
    const v2 = c2 === '=' ? -1 : alphabet.indexOf(c2);
    const v3 = c3 === '=' ? -1 : alphabet.indexOf(c3);

    if (v0 < 0 || v1 < 0 || (v2 < 0 && c2 !== '=') || (v3 < 0 && c3 !== '=')) {
      throw new Error('Invalid base64 value');
    }

    const triple = (v0 << 18) | (v1 << 12) | ((v2 < 0 ? 0 : v2) << 6) | (v3 < 0 ? 0 : v3);
    output.push((triple >> 16) & 0xff);
    if (c2 !== '=') output.push((triple >> 8) & 0xff);
    if (c3 !== '=') output.push(triple & 0xff);
  }

  return new Uint8Array(output);
}

async function readKeyFromStorage(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  if (!KEY_FILE_PATH) return null;
  try {
    return await FileSystem.readAsStringAsync(KEY_FILE_PATH);
  } catch {
    return null;
  }
}

async function writeKeyToStorage(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage write errors. Runtime fallback remains in memory.
    }
    return;
  }

  if (!KEY_FILE_PATH) return;
  try {
    await FileSystem.writeAsStringAsync(KEY_FILE_PATH, value);
  } catch {
    // Ignore key write errors. Runtime fallback remains in memory.
  }
}

function createRawKey(): Uint8Array {
  const bytes = new Uint8Array(KEY_BYTES_LENGTH);
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

async function getOrCreateRawKey(): Promise<Uint8Array | null> {
  if (cachedRawKey) return cachedRawKey;

  if (!loadingKeyPromise) {
    loadingKeyPromise = (async () => {
      const existing = await readKeyFromStorage();
      if (existing) {
        try {
          const decoded = base64ToBytes(existing);
          if (decoded.length === KEY_BYTES_LENGTH) {
            cachedRawKey = decoded;
            return decoded;
          }
        } catch {
          // Continue with key regeneration.
        }
      }

      const generated = createRawKey();
      try {
        await writeKeyToStorage(bytesToBase64(generated));
      } catch {
        // Ignore, keep key in memory.
      }
      cachedRawKey = generated;
      return generated;
    })();
  }

  return loadingKeyPromise;
}

async function getCryptoKey(): Promise<CryptoKey | null> {
  if (!hasAesSupport()) return null;
  if (cachedCryptoKey) return cachedCryptoKey;

  const raw = await getOrCreateRawKey();
  if (!raw) return null;

  const cryptoApi = getCryptoApi();
  if (!cryptoApi) return null;

  cachedCryptoKey = await cryptoApi.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedCryptoKey;
}

export async function encodeOfflinePayload(payload: string): Promise<string> {
  const key = await getCryptoKey();
  if (!key) {
    return `${PLAIN_PREFIX}${payload}`;
  }

  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    return `${PLAIN_PREFIX}${payload}`;
  }

  const iv = new Uint8Array(IV_BYTES_LENGTH);
  cryptoApi.getRandomValues(iv);
  const encoded = new TextEncoder().encode(payload);
  const encryptedBuffer = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encoded));
  const encrypted = new Uint8Array(encryptedBuffer);

  const envelope: EncryptionEnvelope = {
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };

  return `${ENCRYPTED_PREFIX}${JSON.stringify(envelope)}`;
}

export async function decodeOfflinePayload(payload: string): Promise<string | null> {
  if (payload.startsWith(PLAIN_PREFIX)) {
    return payload.slice(PLAIN_PREFIX.length);
  }

  if (!payload.startsWith(ENCRYPTED_PREFIX)) {
    return payload;
  }

  const key = await getCryptoKey();
  const cryptoApi = getCryptoApi();
  if (!key || !cryptoApi) {
    return null;
  }

  try {
    const json = payload.slice(ENCRYPTED_PREFIX.length);
    const envelope = JSON.parse(json) as EncryptionEnvelope;
    if (!envelope?.iv || !envelope?.data) {
      return null;
    }

    const iv = base64ToBytes(envelope.iv);
    const encrypted = base64ToBytes(envelope.data);
    const decryptedBuffer = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encrypted));
    const decoded = new TextDecoder().decode(decryptedBuffer);
    return decoded;
  } catch {
    return null;
  }
}

async function encryptWithPrefix(prefix: string, value: string): Promise<string> {
  const key = await getCryptoKey();
  if (!key) {
    return value;
  }

  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    return value;
  }

  const iv = new Uint8Array(IV_BYTES_LENGTH);
  cryptoApi.getRandomValues(iv);
  const encoded = new TextEncoder().encode(value);
  const encryptedBuffer = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encoded));
  const encrypted = new Uint8Array(encryptedBuffer);
  const envelope: EncryptionEnvelope = {
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
  return `${prefix}${JSON.stringify(envelope)}`;
}

async function decryptWithPrefix(prefix: string, value: string): Promise<string | null> {
  if (!value.startsWith(prefix)) return value;

  const key = await getCryptoKey();
  const cryptoApi = getCryptoApi();
  if (!key || !cryptoApi) {
    return null;
  }

  try {
    const json = value.slice(prefix.length);
    const envelope = JSON.parse(json) as EncryptionEnvelope;
    if (!envelope?.iv || !envelope?.data) return null;

    const iv = base64ToBytes(envelope.iv);
    const encrypted = base64ToBytes(envelope.data);
    const decryptedBuffer = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encrypted));
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return null;
  }
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    throw new Error('Cryptography APIs are unavailable on this device.');
  }

  const passphraseMaterial = await cryptoApi.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptionBackupSupported(): boolean {
  return hasAesSupport();
}

export async function exportEncryptionKeyBackup(passphrase: string): Promise<string> {
  if (passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters long.');
  }

  const rawKey = await getOrCreateRawKey();
  const cryptoApi = getCryptoApi();
  if (!rawKey || !cryptoApi) {
    throw new Error('Secure key backup is unavailable on this device.');
  }

  const salt = new Uint8Array(SALT_BYTES_LENGTH);
  const iv = new Uint8Array(IV_BYTES_LENGTH);
  cryptoApi.getRandomValues(salt);
  cryptoApi.getRandomValues(iv);

  const passphraseKey = await derivePassphraseKey(passphrase, salt);
  const encryptedBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    passphraseKey,
    toArrayBuffer(rawKey)
  );

  const backup: KeyBackupEnvelope = {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };

  return `${KEY_BACKUP_PREFIX}${JSON.stringify(backup)}`;
}

export async function importEncryptionKeyBackup(payload: string, passphrase: string): Promise<void> {
  if (passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters long.');
  }

  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    throw new Error('Secure key restore is unavailable on this device.');
  }

  const serialized = payload.startsWith(KEY_BACKUP_PREFIX)
    ? payload.slice(KEY_BACKUP_PREFIX.length)
    : payload;

  let backup: KeyBackupEnvelope;
  try {
    backup = JSON.parse(serialized) as KeyBackupEnvelope;
  } catch {
    throw new Error('Invalid backup payload format.');
  }

  if (
    backup.version !== 1
    || backup.kdf !== 'PBKDF2-SHA256'
    || typeof backup.salt !== 'string'
    || typeof backup.iv !== 'string'
    || typeof backup.data !== 'string'
  ) {
    throw new Error('Unsupported backup payload format.');
  }

  let decrypted: ArrayBuffer;
  try {
    const salt = base64ToBytes(backup.salt);
    const iv = base64ToBytes(backup.iv);
    const encryptedData = base64ToBytes(backup.data);
    const passphraseKey = await derivePassphraseKey(passphrase, salt);
    decrypted = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      passphraseKey,
      toArrayBuffer(encryptedData)
    );
  } catch {
    throw new Error('Invalid passphrase or corrupted backup payload.');
  }

  const keyBytes = new Uint8Array(decrypted);
  if (keyBytes.length !== KEY_BYTES_LENGTH) {
    throw new Error('Recovered key length is invalid.');
  }

  cachedRawKey = keyBytes;
  cachedCryptoKey = null;
  loadingKeyPromise = null;
  await writeKeyToStorage(bytesToBase64(keyBytes));
}

export async function encryptE2eeString(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined) return null;
  if (value.startsWith(E2EE_PREFIX)) return value;
  return encryptWithPrefix(E2EE_PREFIX, value);
}

export async function decryptE2eeString(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined) return null;
  const decrypted = await decryptWithPrefix(E2EE_PREFIX, value);
  if (decrypted === null) return value;
  return decrypted;
}
