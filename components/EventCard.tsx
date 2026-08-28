import { CalendarDays, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { ScoreBadge } from "@/components/ScoreBadge";
import { formatEventSchedule, formatPrice } from "@/lib/events";
import type { StartupEvent } from "@/lib/types";

const registrationLabels = {
  open: "Registration open",
  "almost-full": "Almost full",
  waitlist: "Waitlist",
} as const;

export function EventCard({
  event,
  rank,
}: {
  event: StartupEvent;
  rank: number;
}) {
  return (
    <article
      className={`event-card ${rank === 1 ? "event-card-top" : ""}`}
      aria-labelledby={`title-${event.id}`}
    >
      <div className="event-main">
        <div className="flex flex-wrap items-center gap-2">
          <span className="event-rank">{String(rank).padStart(2, "0")}</span>
          {event.categories.map((category) => (
            <span
              key={category}
              className={`category category-${category.toLowerCase()}`}
            >
              {category}
            </span>
          ))}
          {event.isNew && (
            <span className="new-label">
              <span aria-hidden="true" />
              New
            </span>
          )}
        </div>
        <div className="event-heading">
          <div>
            <h3 id={`title-${event.id}`}>{event.title}</h3>
            <p className="organizer">Hosted by {event.organizer}</p>
          </div>
          <ScoreBadge score={event.networkingScore} prominent />
        </div>
        <div className="event-details">
          <p>
            <CalendarDays size={15} aria-hidden="true" />
            <time dateTime={event.startsAt}>{formatEventSchedule(event)}</time>
          </p>
          <p>
            <MapPin size={15} aria-hidden="true" />
            <span>
              {event.venue} · {event.neighborhood}, {event.borough}
            </span>
          </p>
        </div>
        <div className="recommendation">
          <h4>
            <Sparkles size={14} aria-hidden="true" />
            Why FounderRadar recommends it
          </h4>
          <p>{event.recommendation}</p>
        </div>
        {event.potentialDownside && (
          <p className="downside">
            <span>Potential downside</span> {event.potentialDownside}
          </p>
        )}
        <div className="event-footer">
          <div className="score-group">
            <Users size={14} aria-hidden="true" />
            <ScoreBadge score={event.founderScore} label="Founder" />
            <span className="score-divider" />
            <ScoreBadge score={event.investorScore} label="Investor" />
          </div>
          <div className="event-cost">
            <Ticket size={14} aria-hidden="true" />
            <strong>{formatPrice(event.priceUsd)}</strong>
            <span>via {event.source}</span>
          </div>
        </div>
      </div>
      <div className="event-status-bar">
        <span
          className={`registration registration-${event.registrationStatus}`}
        >
          <span aria-hidden="true" />
          {registrationLabels[event.registrationStatus]}
        </span>
        <span>Sample listing · no registration</span>
      </div>
    </article>
  );
}
