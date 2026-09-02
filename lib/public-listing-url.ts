/** Canonical public links only. Never fetch, preserve query secrets, or infer redirects. */
export function publicListingUrl(
  input: string | null | undefined,
): string | null {
  if (!input || input.length > 2048 || /[\s\x00-\x1f\x7f\\]/u.test(input))
    return null;
  const url = input
    .split(/[?#]/, 1)[0]
    .replace(/\/+$/, "")
    .replace(/^https:\/\/www\./, "https://")
    .replace(/^https:\/\/lu\.ma\//, "https://luma.com/");
  if (
    (/^https:\/\/luma\.com\/[A-Za-z0-9_-]+$/.test(url) &&
      !/^https:\/\/luma\.com\/(discover|explore|home|signin|login|pricing|calendar|create|nyc|new-york)$/i.test(
        url,
      )) ||
    /^https:\/\/meetup\.com\/[A-Za-z0-9_-]+\/events\/[0-9]+$/.test(url) ||
    /^https:\/\/eventbrite\.com\/e\/[A-Za-z0-9_-]*tickets-[0-9]+$/.test(url)
  )
    return url;
  return null;
}
