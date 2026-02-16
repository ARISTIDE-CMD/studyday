import { supabase } from '@/lib/supabase';

type AskAssistantInput = {
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
};

type AskAssistantResponse = {
  text: string;
  model?: string;
};

async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  if (!forceRefresh && currentSession?.access_token && (currentSession.expires_at ?? 0) > nowSeconds + 45) {
    return currentSession.access_token;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session?.access_token) {
    throw new Error('Session expiree. Reconnecte-toi puis reessaie.');
  }

  return refreshed.session.access_token;
}

type InvokeErrorPayload = {
  error?: string;
  detail?: string;
  message?: string;
  upstreamDetail?: string;
  upstreamStatus?: number;
};

function getInvokeErrorMessage(error: unknown): string {
  const maybeError = error as { message?: string };
  return (maybeError?.message || '').trim();
}

async function parseInvokeError(error: unknown): Promise<string> {
  const maybeError = error as { message?: string; context?: Response };
  const responseContext = maybeError?.context;
  let parsedMessage = '';

  if (responseContext && typeof responseContext.json === 'function') {
    try {
      const payload = (await responseContext.json()) as InvokeErrorPayload;
      parsedMessage = [payload.error, payload.detail, payload.upstreamDetail, payload.message]
        .filter(Boolean)
        .join(' ')
        .trim();
    } catch {
      // Ignore parse errors and fallback to base error message.
    }
  }

  return parsedMessage || maybeError?.message || 'Erreur IA inconnue.';
}

async function invokeAssistant(prompt: string, maxOutputTokens: number, temperature: number, accessToken: string) {
  return supabase.functions.invoke('ai-assistant', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      prompt,
      maxOutputTokens,
      temperature,
    },
  });
}

export async function askAssistant(input: AskAssistantInput): Promise<AskAssistantResponse> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error('Prompt vide.');
  }

  const maxOutputTokens = input.maxOutputTokens ?? 420;
  const temperature = input.temperature ?? 0.2;
  const accessToken = (await getValidAccessToken()).trim();
  let { data, error } = await invokeAssistant(prompt, maxOutputTokens, temperature, accessToken);

  // Retry once with forced refresh when token gets rejected by gateway/function.
  if (error) {
    const message = getInvokeErrorMessage(error).toLowerCase();
    if (message.includes('invalid jwt')) {
      const refreshedToken = (await getValidAccessToken(true)).trim();
      const retry = await invokeAssistant(prompt, maxOutputTokens, temperature, refreshedToken);
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    throw new Error(await parseInvokeError(error));
  }

  const typed = (data ?? {}) as Partial<AskAssistantResponse>;
  if (!typed.text || !typed.text.trim()) {
    throw new Error('Reponse IA vide.');
  }

  return {
    text: typed.text.trim(),
    model: typed.model,
  };
}

export async function summarizeText(input: { text: string; locale?: string }): Promise<string> {
  const isFrench = (input.locale ?? '').toLowerCase().startsWith('fr');
  const instruction = isFrench
    ? [
        'Resumer le texte suivant en 6 points maximum.',
        'Garder uniquement les idees importantes.',
        'Style clair pour etudiant.',
      ].join(' ')
    : [
        'Summarize the following text in up to 6 bullet points.',
        'Keep only the most important ideas.',
        'Use a clear student-friendly style.',
      ].join(' ');

  const { text } = await askAssistant({
    prompt: `${instruction}\n\n${input.text}`,
    maxOutputTokens: 500,
    temperature: 0.2,
  });
  return text;
}
