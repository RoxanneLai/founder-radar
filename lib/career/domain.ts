type DomainFact = { value: string | null; quote: string | null };

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match whole phrases, never substrings or approximate model labels. */
function containsPhrase(text: string, phrase: string): boolean {
  const words = ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
  const expected = phrase.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return expected.length > 0 && words.includes(` ${expected} `);
}

/** Only the reviewed observability compound gets a technical-context alias. */
function supportsObservability(parts: string[], quote: string): boolean {
  return (
    parts.length === 2 &&
    parts.includes("developer tools") &&
    parts.includes("observability") &&
    containsPhrase(quote, "observability") &&
    ["open source", "software", "database", "postgres", "production"].some(
      (term) => containsPhrase(quote, term),
    )
  );
}

/** Preserve exact matches; require quote support for a newly recognized compound. */
export function matchesPreferredDomain(
  fact: DomainFact,
  preferredDomains: string[],
): boolean {
  if (fact.value === null || fact.quote === null) return false;
  const label = normalizeLabel(fact.value);
  const quote = fact.quote;
  const preferences = preferredDomains.map(normalizeLabel);
  if (preferences.includes(label)) return true;
  const parts = label.split(/\s+(?:and|&)\s+|[,/;]/).map(normalizeLabel);
  if (
    parts.length < 2 ||
    parts.length > 8 ||
    parts.some((part) => !part) ||
    /\b(?:not|no|without|excluding|unrelated)\b/i.test(quote)
  )
    return false;
  return preferences.some(
    (preferred) =>
      parts.includes(preferred) &&
      (containsPhrase(quote, preferred) ||
        (preferred === "developer tools" &&
          supportsObservability(parts, quote))),
  );
}
