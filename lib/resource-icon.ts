import type { Resource } from '@/types/supabase';

export type ResourceIconKind = 'note' | 'link' | 'pdf' | 'image' | 'doc' | 'sheet' | 'slides' | 'archive' | 'text' | 'file';

type ResourceLike = Pick<Resource, 'type' | 'title' | 'file_url' | 'content'>;

type IconPalette = {
  bg: string;
  fg: string;
};

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'tiff', 'avif', 'svg']);
const pdfExtensions = new Set(['pdf']);
const docExtensions = new Set(['doc', 'docx', 'odt', 'rtf']);
const sheetExtensions = new Set(['xls', 'xlsx', 'csv', 'ods']);
const slidesExtensions = new Set(['ppt', 'pptx', 'odp', 'key']);
const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
const textExtensions = new Set(['txt', 'md', 'markdown', 'log']);

const paletteByKind: Record<ResourceIconKind, IconPalette> = {
  note: { bg: '#E0F2FE', fg: '#0C4A6E' },
  link: { bg: '#D1FAE5', fg: '#065F46' },
  pdf: { bg: '#FEE2E2', fg: '#B91C1C' },
  image: { bg: '#DCFCE7', fg: '#166534' },
  doc: { bg: '#DBEAFE', fg: '#1D4ED8' },
  sheet: { bg: '#DCFCE7', fg: '#047857' },
  slides: { bg: '#FFEDD5', fg: '#C2410C' },
  archive: { bg: '#EDE9FE', fg: '#6D28D9' },
  text: { bg: '#FEF3C7', fg: '#92400E' },
  file: { bg: '#F3F4F6', fg: '#374151' },
};

const labelByKind: Record<ResourceIconKind, string> = {
  note: 'NOTE',
  link: 'URL',
  pdf: 'PDF',
  image: 'IMG',
  doc: 'DOC',
  sheet: 'XLS',
  slides: 'PPT',
  archive: 'ZIP',
  text: 'TXT',
  file: 'FILE',
};

function extractExtension(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\.([a-z0-9]{1,8})(?:$|[?#])/i);
  return match ? match[1].toLowerCase() : null;
}

function resolveFileExtension(resource: ResourceLike): string | null {
  const fromFileUrl = extractExtension(resource.file_url);
  if (fromFileUrl) return fromFileUrl;

  const fromContent = extractExtension(resource.content);
  if (fromContent) return fromContent;

  return extractExtension(resource.title);
}

function resolveKindFromExtension(extension: string): ResourceIconKind | null {
  if (pdfExtensions.has(extension)) return 'pdf';
  if (imageExtensions.has(extension)) return 'image';
  if (docExtensions.has(extension)) return 'doc';
  if (sheetExtensions.has(extension)) return 'sheet';
  if (slidesExtensions.has(extension)) return 'slides';
  if (archiveExtensions.has(extension)) return 'archive';
  if (textExtensions.has(extension)) return 'text';
  return null;
}

export function resolveResourceIconKind(resource: ResourceLike): ResourceIconKind {
  if (resource.type === 'note') return 'note';

  const extension = resolveFileExtension(resource);
  if (extension) {
    const fromExtension = resolveKindFromExtension(extension);
    if (fromExtension) return fromExtension;
  }

  if (resource.type === 'link') return 'link';
  return 'file';
}

function buildDocumentSvg(label: string, palette: IconPalette) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="${palette.bg}" />
  <path d="M7.4 5.4h6l3.3 3.3v9.9a1 1 0 0 1-1 1H7.4a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1Z" fill="#FFFFFF" />
  <path d="M13.4 5.4v2.4a1 1 0 0 0 1 1h2.3" fill="none" stroke="${palette.fg}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
  <text x="12" y="17.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.5" font-weight="700" fill="${palette.fg}">${label}</text>
</svg>`.trim();
}

function buildImageSvg(palette: IconPalette) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="${palette.bg}" />
  <rect x="5.4" y="6" width="13.2" height="10.4" rx="1.8" fill="#FFFFFF" />
  <circle cx="15.3" cy="8.9" r="1.1" fill="${palette.fg}" />
  <path d="M6.4 15.2 9.7 11.7 11.9 14 14.1 11.6 17.5 15.2" fill="none" stroke="${palette.fg}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
  <text x="12" y="20.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.5" font-weight="700" fill="${palette.fg}">IMG</text>
</svg>`.trim();
}

function buildLinkSvg(palette: IconPalette) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="${palette.bg}" />
  <path d="M10 8.6H8.7a2.9 2.9 0 0 0 0 5.8H10M14 8.6h1.3a2.9 2.9 0 0 1 0 5.8H14M9.4 12h5.2" fill="none" stroke="${palette.fg}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  <text x="12" y="19.8" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.4" font-weight="700" fill="${palette.fg}">URL</text>
</svg>`.trim();
}

function buildNoteSvg(palette: IconPalette) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="${palette.bg}" />
  <rect x="6" y="5.7" width="12" height="12.6" rx="1.8" fill="#FFFFFF" />
  <path d="M8.2 9h7.6M8.2 11.3h7.6M8.2 13.6h5.5" fill="none" stroke="${palette.fg}" stroke-width="1.2" stroke-linecap="round" />
  <text x="12" y="20.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.5" font-weight="700" fill="${palette.fg}">NOTE</text>
</svg>`.trim();
}

function toDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildSvgByKind(kind: ResourceIconKind): string {
  const palette = paletteByKind[kind];

  if (kind === 'image') return toDataUri(buildImageSvg(palette));
  if (kind === 'link') return toDataUri(buildLinkSvg(palette));
  if (kind === 'note') return toDataUri(buildNoteSvg(palette));

  return toDataUri(buildDocumentSvg(labelByKind[kind], palette));
}

export function getResourceIconMeta(resource: ResourceLike) {
  const kind = resolveResourceIconKind(resource);
  return {
    kind,
    svgUri: buildSvgByKind(kind),
    palette: paletteByKind[kind],
    label: labelByKind[kind],
  };
}
