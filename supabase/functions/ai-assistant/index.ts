const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AskBody = {
  prompt?: unknown;
  maxOutputTokens?: unknown;
  temperature?: unknown;
  systemPrompt?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function toClampedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function extractText(payload: Record<string, unknown>): string {
  const outputText = payload.output_text;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadPart = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

  try {
    const decoded = atob(payloadPart);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing auth token.' });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return jsonResponse(401, { error: 'Invalid auth token format.' });
  }
  const jwtPayload = decodeJwtPayload(token);
  const userId = typeof jwtPayload?.sub === 'string' ? jwtPayload.sub : '';
  if (!userId) {
    return jsonResponse(401, { error: 'Unauthorized.', detail: 'Invalid JWT payload.' });
  }

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiApiKey) {
    return jsonResponse(500, { error: 'OPENAI_API_KEY is missing.' });
  }

  let body: AskBody | null = null;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const prompt = String(body?.prompt ?? '').trim();
  if (prompt.length < 3) {
    return jsonResponse(400, { error: 'Prompt is too short.' });
  }
  if (prompt.length > 8000) {
    return jsonResponse(400, { error: 'Prompt is too long.' });
  }

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const temperature = toClampedNumber(body?.temperature, 0.2, 0, 1.2);
  const maxOutputTokens = Math.round(toClampedNumber(body?.maxOutputTokens, 420, 64, 1200));
  const systemPrompt =
    typeof body?.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : 'You are a concise study assistant. Give practical and clear answers.';

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_output_tokens: maxOutputTokens,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
    }),
  });

  const payload = (await openAiResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!openAiResponse.ok) {
    const error = payload.error;
    const message =
      error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string'
        ? (error as Record<string, unknown>).message
        : 'OpenAI request failed.';
    console.error('openai_upstream_error', {
      upstreamStatus: openAiResponse.status,
      message,
    });
    if (openAiResponse.status === 401) {
      return jsonResponse(502, {
        error: 'OpenAI authentication failed.',
        detail: 'Invalid OpenAI API key configured in Supabase secrets.',
        upstreamDetail: message,
        upstreamStatus: openAiResponse.status,
      });
    }
    return jsonResponse(502, {
      error: 'OpenAI upstream error.',
      detail: message,
      upstreamStatus: openAiResponse.status,
    });
  }

  const text = extractText(payload);
  if (!text) {
    return jsonResponse(502, { error: 'Empty model response.' });
  }

  return jsonResponse(200, {
    text,
    model,
  });
});
