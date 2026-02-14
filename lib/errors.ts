type ErrorWithMessage = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getErrorMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'object' && error !== null) {
    const typed = error as ErrorWithMessage;
    const message = asText(typed.message);
    const details = asText(typed.details);
    const hint = asText(typed.hint);

    const parts = [message, details, hint].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' - ');
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return fallback;
}
