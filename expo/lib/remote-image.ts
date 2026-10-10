const SCRYFALL_IMAGE_PREFIX = 'https://cards.scryfall.io/';

export const SCRYFALL_IMAGE_HEADERS = {
  Accept: 'image/*',
  'User-Agent': '21Life/9.1.1 (support@21life.win)',
} as const;

export function getRemoteImageHeaders(uri: string): Record<string, string> | undefined {
  return uri.startsWith(SCRYFALL_IMAGE_PREFIX)
    ? SCRYFALL_IMAGE_HEADERS
    : undefined;
}
