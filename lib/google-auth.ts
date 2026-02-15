import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

function isDeepLink(url: string): boolean {
  return url.startsWith('studyday://') || url.startsWith('exp://');
}

function isWebUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function buildRuntimeRedirect(path: string): string {
  const runtimeUrl = Linking.createURL(path);
  const lower = runtimeUrl.toLowerCase();
  const isLocalhostRuntime =
    lower.startsWith('http://localhost') ||
    lower.startsWith('https://localhost') ||
    lower.startsWith('http://127.0.0.1') ||
    lower.startsWith('https://127.0.0.1');

  if (isLocalhostRuntime) {
    return `studyday://${path}`;
  }

  return runtimeUrl;
}

function readParam(url: URL, key: string): string | null {
  const fromQuery = url.searchParams.get(key);
  if (fromQuery) return fromQuery;

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  return hashParams.get(key);
}

export async function signInWithGoogle(redirectPath = '/login'): Promise<void> {
  const configuredRedirect = process.env.EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim() ?? '';
  const configuredWebFallback = process.env.EXPO_PUBLIC_SUPABASE_AUTH_WEB_FALLBACK_URL?.trim() ?? '';
  const normalizedPath = redirectPath.replace(/^\/+/, '');
  const runtimeRedirect = buildRuntimeRedirect(normalizedPath);
  let mobileRedirect = isDeepLink(configuredRedirect) ? configuredRedirect : runtimeRedirect;

  // Expo Go handles exp:// callbacks, not custom app schemes.
  if (runtimeRedirect.startsWith('exp://') && configuredRedirect.startsWith('studyday://')) {
    mobileRedirect = runtimeRedirect;
  }

  const webRedirect =
    isWebUrl(configuredRedirect)
      ? configuredRedirect
      : (isWebUrl(configuredWebFallback) ? configuredWebFallback : null);
  const redirectTo = Platform.OS === 'web' && webRedirect ? webRedirect : mobileRedirect;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    if (String(error.message ?? '').toLowerCase().includes('validation_failed')) {
      throw new Error(
        `OAuth configuration invalid (validation_failed). redirect_to=${redirectTo}`
      );
    }
    throw error;
  }

  if (!data?.url) {
    throw new Error('Google OAuth URL is missing.');
  }

  const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (authResult.type !== 'success' || !authResult.url) {
    throw new Error('Google sign-in was cancelled.');
  }

  const callbackUrl = new URL(authResult.url);
  const providerError = readParam(callbackUrl, 'error');
  const providerErrorDescription = readParam(callbackUrl, 'error_description');

  if (providerError || providerErrorDescription) {
    throw new Error(providerErrorDescription ?? providerError ?? 'Google authentication failed.');
  }

  const code = readParam(callbackUrl, 'code');

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      throw exchangeError;
    }
    return;
  }

  const accessToken = readParam(callbackUrl, 'access_token');
  const refreshToken = readParam(callbackUrl, 'refresh_token');

  if (!accessToken || !refreshToken) {
    throw new Error('No session payload was returned by Google sign-in.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    throw sessionError;
  }
}
