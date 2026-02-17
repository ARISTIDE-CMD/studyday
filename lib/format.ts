export function formatDateLabel(
  value: string | null | undefined,
  locale = 'fr-FR',
  emptyLabel = 'Sans date'
) {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeLabel(
  value: string | null | undefined,
  locale = 'fr-FR',
  emptyLabel = 'Sans date',
  options?: { includeSeconds?: boolean }
) {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: options?.includeSeconds ? '2-digit' : undefined,
  }).format(date);
}

export function toIsoDate(value: Date = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function humanNow(locale = 'fr-FR') {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
