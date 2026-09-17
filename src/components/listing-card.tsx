import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Play } from "lucide-react";
import {
  bedroomLabel,
  formatNaira,
  listingCoverSrc,
  type Listing,
} from "@/lib/listings";

export function ListingCard({ listing }: { listing: Listing }) {
  const posted = formatDistanceToNow(new Date(listing.postedAt), { addSuffix: true });
  const media = listing.media ?? [];
  const coverVideo = media.length > 0 && !media.some((m) => m.kind === "image") && media[0]?.kind === "video";
  const extra = media.length;

  return (
    <Link
      to="/listings/$id"
      params={{ id: listing.id }}
      className="group flex flex-col overflow-hidden rounded-xl bg-bg-elevated shadow-[0_1px_0_var(--color-border)] ring-1 ring-border transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-18px_var(--color-fg)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-bg-subtle">
        {coverVideo ? (
          <video
            src={`/api/media/${media[0].id}`}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <img
            src={listingCoverSrc(listing)}
            alt=""
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        )}
        {coverVideo ? (
          <span className="absolute inset-0 flex items-center justify-center bg-fg/25">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-bg/90 text-fg">
              <Play className="size-4" fill="currentColor" />
            </span>
          </span>
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-bg/90 px-2.5 py-1 text-xs font-medium text-fg backdrop-blur-sm">
          {bedroomLabel(listing.bedrooms, listing.propertyType)}
        </span>
        {extra > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-fg/80 px-2.5 py-1 text-xs font-medium text-bg">
            {extra} from WhatsApp
          </span>
        ) : extra === 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-fg/80 px-2.5 py-1 text-xs font-medium text-bg">
            From WhatsApp
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg leading-snug tracking-tight text-fg">
              {listing.neighborhood || listing.area}
            </p>
            <p className="text-sm text-fg-muted">{listing.area}</p>
          </div>
          <p className="shrink-0 text-right font-medium tabular-nums text-fg">
            {formatNaira(listing.rentAnnual)}
            <span className="block text-xs font-normal text-fg-subtle">/ year</span>
          </p>
        </div>
        <p className="mt-auto pt-2 text-xs text-fg-subtle">
          from {listing.groupName} · {posted}
        </p>
      </div>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-bg-elevated ring-1 ring-border">
      <div className="aspect-[4/3] animate-pulse bg-bg-subtle" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded-sm bg-bg-subtle" />
        <div className="h-4 w-1/3 animate-pulse rounded-sm bg-bg-subtle" />
        <div className="h-3 w-1/2 animate-pulse rounded-sm bg-bg-subtle" />
      </div>
    </div>
  );
}