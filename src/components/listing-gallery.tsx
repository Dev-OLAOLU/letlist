import { useState } from "react";
import { Play } from "lucide-react";
import { listingCoverSrc, listingImageSrc, type Listing } from "@/lib/listings";
import { cn } from "@/lib/utils";

export function ListingGallery({ listing }: { listing: Listing }) {
  const media = listing.media ?? [];
  const [active, setActive] = useState(0);
  const current = media[active];

  if (media.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl bg-bg-subtle">
        <img
          src={listingImageSrc(listing.imageKey)}
          alt=""
          className="aspect-[16/10] w-full object-cover sm:aspect-[2/1]"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-bg-subtle">
        {current?.kind === "video" ? (
          <video
            key={current.id}
            src={`/api/media/${current.id}`}
            controls
            playsInline
            preload="metadata"
            className="aspect-[16/10] w-full bg-fg object-contain sm:aspect-[2/1]"
          />
        ) : (
          <img
            src={current ? `/api/media/${current.id}` : listingCoverSrc(listing)}
            alt=""
            className="aspect-[16/10] w-full object-cover sm:aspect-[2/1]"
          />
        )}
      </div>
      {media.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "relative h-16 w-20 shrink-0 overflow-hidden rounded-sm ring-2 transition-shadow",
                index === active ? "ring-accent" : "ring-transparent",
              )}
              aria-label={item.kind === "video" ? `Video ${index + 1}` : `Photo ${index + 1}`}
            >
              {item.kind === "video" ? (
                <>
                  <video src={`/api/media/${item.id}`} muted playsInline preload="metadata" className="size-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-fg/40">
                    <Play className="size-4 text-bg" fill="currentColor" />
                  </span>
                </>
              ) : (
                <img src={`/api/media/${item.id}`} alt="" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-sm text-fg-subtle">
        {media.length === 1 ? "From the WhatsApp post" : `${media.length} from the WhatsApp post`}
      </p>
    </div>
  );
}
