import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bath, BedDouble, Building2, MapPin } from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { ListingGallery } from "@/components/listing-gallery";
import { Button } from "@/components/ui/button";
import { WhatsappButton } from "@/components/whatsapp-button";
import {
  bedroomLabel,
  formatNaira,
  formatNairaFull,
  propertyTypeLabel,
} from "@/lib/listings";
import { getListing, markListingTaken, similarListings } from "@/lib/listing-api";
import { getDeskPhones } from "@/lib/whatsapp-sync";

export const Route = createFileRoute("/listings/$id")({
  loader: async ({ params }) => {
    const [listing, similar, phones] = await Promise.all([
      getListing({ data: { id: params.id } }),
      similarListings({ data: { id: params.id } }),
      getDeskPhones(),
    ]);
    return { listing, similar, phones };
  },
  component: ListingPage,
});

function ListingPage() {
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const queryClient = useQueryClient();

  const listingQuery = useQuery({
    queryKey: ["listing", id],
    queryFn: () => getListing({ data: { id } }),
    initialData: initial.listing,
  });
  const similarQuery = useQuery({
    queryKey: ["similar", id],
    queryFn: () => similarListings({ data: { id } }),
    initialData: initial.similar,
  });

  const taken = useMutation({
    mutationFn: () => markListingTaken({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing", id] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
  });

  const listing = listingQuery.data;

  if (listingQuery.isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="aspect-[16/10] animate-pulse rounded-xl bg-bg-subtle" />
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl tracking-tight">This listing is gone</h1>
        <p className="mt-2 text-fg-muted">It may have been taken, or the link is old.</p>
        <Button className="mt-6" asChild>
          <Link to="/">Back to search</Link>
        </Button>
      </main>
    );
  }

  const fees = [
    { label: "Annual rent", value: listing.rentAnnual },
    { label: "Agency (10%)", value: listing.agencyFee },
    { label: "Legal (10%)", value: listing.legalFee },
    { label: "Service charge", value: listing.serviceCharge },
    { label: "Caution", value: listing.cautionFee },
  ].filter((row): row is { label: string; value: number } => row.value != null);

  const moveIn =
    listing.rentAnnual +
    (listing.agencyFee ?? 0) +
    (listing.legalFee ?? 0) +
    (listing.serviceCharge ?? 0) +
    (listing.cautionFee ?? 0);

  return (
    <main className="pb-24 sm:pb-16">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          All listings
        </Link>

        <div className="mt-4">
          <ListingGallery listing={listing} />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <p className="text-sm text-fg-muted">
              {propertyTypeLabel(listing.propertyType)} · from {listing.groupName}
            </p>
            <h1 className="mt-2 font-display text-title tracking-tight sm:text-4xl">
              {bedroomLabel(listing.bedrooms, listing.propertyType)} in {listing.neighborhood || listing.area}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-fg-muted">
              <MapPin className="size-4" />
              {listing.area}
              {listing.neighborhood ? ` · ${listing.neighborhood}` : ""}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-bg-subtle px-3">
                <BedDouble className="size-4" />
                {listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bed`}
              </span>
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-bg-subtle px-3">
                <Bath className="size-4" />
                {listing.bathrooms} bath
              </span>
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-bg-subtle px-3">
                <Building2 className="size-4" />
                {propertyTypeLabel(listing.propertyType)}
              </span>
            </div>

            <p className="mt-8 max-w-2xl text-base leading-relaxed text-fg">{listing.description}</p>

            {listing.amenities.length > 0 ? (
              <div className="mt-8">
                <h2 className="font-display text-xl tracking-tight">In the post</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {listing.amenities.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {listing.rawPost ? (
              <div className="mt-10">
                <h2 className="font-display text-xl tracking-tight">Original WhatsApp post</h2>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-bg-elevated p-5 font-sans text-sm leading-relaxed text-fg-muted ring-1 ring-border">
                  {listing.rawPost}
                </pre>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border">
              <p className="text-sm text-fg-muted">Annual rent</p>
              <p className="mt-1 font-display text-3xl tabular-nums tracking-tight">
                {formatNaira(listing.rentAnnual)}
              </p>
              <p className="text-sm text-fg-subtle">{formatNairaFull(listing.rentAnnual)} / year</p>

              <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                {fees.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <dt className="text-fg-muted">{row.label}</dt>
                    <dd className="tabular-nums">{formatNairaFull(row.value)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
                  <dt>To move in</dt>
                  <dd className="tabular-nums">{formatNairaFull(moveIn)}</dd>
                </div>
              </dl>

              {listing.status === "taken" ? (
                <p className="mt-5 rounded-md bg-bg-subtle px-3 py-2 text-sm text-fg-muted">This one has been taken.</p>
              ) : (
                <div className="mt-5 space-y-2">
                  <WhatsappButton listing={listing} phone={initial.phones.agentPhone} />
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => taken.mutate()}
                    disabled={taken.isPending}
                  >
                    Mark as taken
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>

        {similarQuery.data && similarQuery.data.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-display text-title tracking-tight">Nearby in the groups</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {similarQuery.data.map((item) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
