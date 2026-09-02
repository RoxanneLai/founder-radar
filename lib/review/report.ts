import { z } from "zod";
import { normalizePublishedEvents } from "../dashboard/normalize.ts";
import { formatEventSchedule, formatStoredPrice } from "../events.ts";
import { publicListingUrl } from "../public-listing-url.ts";

const sourceSchema = z
  .object({
    id: z.string().uuid(),
    event_id: z.string().uuid(),
    source_url: z.string(),
    content_text: z.string().nullable(),
    fetched_at: z.string().nullable(),
    last_attempt_error: z.string().nullable(),
    raw_payload: z.unknown(),
  })
  .passthrough();
const reviewSchema = z.object({
  event: z
    .object({
      id: z.string().uuid(),
      publication_status: z.string(),
      is_fixture: z.boolean(),
    })
    .passthrough(),
  sources: z.array(sourceSchema).max(25),
  selected_source_id: z.string().uuid().nullable(),
  public_registration_url: z.string().nullable(),
  review_token: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Private operator report; never import into a public route or serialize as page props. */
export function buildReviewReport(input: unknown, now = new Date()) {
  const review = reviewSchema.parse(input);
  const event = review.event;
  const blockers: string[] = [];
  const warnings: string[] = [
    "Evidence is untrusted, model-generated research, not independent verification. Check the listing yourself before approving.",
  ];
  if (event.publication_status !== "draft" || event.is_fixture)
    blockers.push("Only non-fixture drafts can be published.");
  const source = review.sources.find(
    (item) => item.id === review.selected_source_id,
  );
  if (!source || source.event_id !== event.id)
    blockers.push("Select a source linked to this event.");
  else {
    if (
      !source.content_text?.trim() ||
      !source.fetched_at ||
      source.last_attempt_error
    )
      blockers.push(
        "Selected source needs successful evidence with no unresolved failed attempt.",
      );
    if (!source.fetched_at || !Number.isFinite(Date.parse(source.fetched_at)))
      blockers.push("Selected source has no valid evidence timestamp.");
    else if (now.getTime() - Date.parse(source.fetched_at) > 7 * 86400000)
      warnings.push(
        "Selected evidence is more than seven days old; confirm current details.",
      );
  }
  const url = publicListingUrl(source?.source_url);
  if (review.sources.length > 1)
    warnings.push(
      "Multiple sources are linked. Compare their facts and resolve conflicts before approving.",
    );
  if (source && url && source.source_url !== url)
    warnings.push(
      "The public link removes aliases, query parameters, or fragments. Verify this exact link works without private access tokens.",
    );
  if (!url || url !== review.public_registration_url)
    blockers.push("Selected listing has no valid canonical public link.");
  let publicCard;
  try {
    [publicCard] = normalizePublishedEvents(
      [
        {
          ...event,
          publication_status: "published",
          public_registration_url: url,
        },
      ],
      now,
    );
    if (!publicCard || Date.parse(publicCard.startsAt) <= now.getTime())
      blockers.push("Event would not appear in the upcoming NYC feed.");
  } catch {
    blockers.push(
      "Event has invalid display fields; correct them before publishing.",
    );
  }
  if (publicCard) {
    for (const [value, label] of [
      [publicCard.organizer, "Organizer"],
      [publicCard.venue, "Venue"],
      [publicCard.endsAt, "End time"],
      [publicCard.priceAmountCents, "Price"],
      [publicCard.networkingScore, "Networking score"],
      [publicCard.recommendation, "Recommendation"],
    ] as const)
      if (value === null)
        warnings.push(`${label} is not listed and will remain unknown.`);
    if (!publicCard.categories.length)
      warnings.push("No recognized category has been assigned.");
    if (
      ["unknown", "closed", "waitlist"].includes(publicCard.registrationStatus)
    )
      warnings.push(
        `Registration status is ${publicCard.registrationStatus}; verify availability.`,
      );
  }
  return {
    privacy:
      "PRIVATE OPERATOR REPORT — do not share or place in public/ or app/.",
    event,
    sources: review.sources,
    blockers,
    warnings,
    publicPreview: publicCard
      ? {
          card: publicCard,
          schedule: formatEventSchedule(publicCard),
          price: formatStoredPrice(
            publicCard.priceAmountCents,
            publicCard.currencyCode,
          ),
          note: "Exact public card data; rank depends on other events and visibility changes with time.",
        }
      : null,
    approval: blockers.length
      ? null
      : {
          eventId: event.id,
          sourceId: source!.id,
          token: review.review_token,
          acknowledgement:
            "--approve confirms you reviewed all evidence, warnings, public fields, and the registration link.",
        },
  };
}
