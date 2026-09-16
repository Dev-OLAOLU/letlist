import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WhatsappDesk } from "@/components/whatsapp-desk";
import { AREAS, formatNaira, listingImageSrc, PROPERTY_TYPES } from "@/lib/listings";
import { listGroups, publishListing } from "@/lib/listing-api";
import { parseWhatsappPost, SAMPLE_POSTS } from "@/lib/whatsapp-parser";
import { getWhatsappStatus } from "@/lib/whatsapp-sync";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/desk")({
  loader: async () => {
    const [groups, whatsapp] = await Promise.all([listGroups(), getWhatsappStatus()]);
    return { groups, whatsapp };
  },
  component: DeskPage,
});

const IMAGE_KEYS = [
  "lekki-living",
  "ikoyi-bedroom",
  "ikeja-miniflat",
  "yaba-selfcontain",
  "ajah-duplex",
  "vi-living",
  "kitchen",
  "magodo-estate",
  "surulere-living",
  "ensuite",
];

function DeskPage() {
  const initial = Route.useLoaderData();
  const [tab, setTab] = useState<"whatsapp" | "paste">("whatsapp");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">Agent desk</p>
      <h1 className="mt-3 font-display text-display tracking-tight">Keep the groups feeding the hub</h1>
      <p className="mt-4 max-w-2xl text-fg-muted">
        WhatsApp is the data centre. Save the Meta inbox number and your personal line, hook the webhook, then
        forward every listing. Paste a post when you are not at the inbox.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <FilterChip active={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>
          WhatsApp groups
        </FilterChip>
        <FilterChip active={tab === "paste"} onClick={() => setTab("paste")}>
          Paste a post
        </FilterChip>
      </div>

      {tab === "whatsapp" ? (
        <WhatsappDesk initial={initial.whatsapp} />
      ) : (
        <PasteDesk initialGroupId={initial.groups[0]?.id ?? "g-lekki"} />
      )}
    </main>
  );
}

function PasteDesk({ initialGroupId }: { initialGroupId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(SAMPLE_POSTS[0].body);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [imageKey, setImageKey] = useState("lekki-living");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseWhatsappPost(raw), [raw]);
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
  });

  const publish = useMutation({
    mutationFn: () => {
      if (!parsed.area) throw new Error("Could not read an area from that post.");
      if (!parsed.rentAnnual) throw new Error("Could not read a rent from that post.");
      return publishListing({
        data: {
          groupId,
          title: parsed.title,
          area: parsed.area,
          neighborhood: parsed.neighborhood,
          propertyType: parsed.propertyType,
          bedrooms: parsed.bedrooms,
          bathrooms: parsed.bathrooms,
          rentAnnual: parsed.rentAnnual,
          agencyFee: parsed.agencyFee,
          legalFee: parsed.legalFee,
          serviceCharge: parsed.serviceCharge,
          cautionFee: parsed.cautionFee,
          description: parsed.description,
          amenities: parsed.amenities,
          imageKey,
          rawPost: raw,
        },
      });
    },
    onSuccess: async (listing) => {
      setError(null);
      await queryClient.invalidateQueries();
      await navigate({ to: "/listings/$id", params: { id: listing.id } });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not publish.");
    },
  });

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2">
        {SAMPLE_POSTS.map((sample) => (
          <button
            key={sample.label}
            type="button"
            onClick={() => setRaw(sample.body)}
            className="h-10 rounded-full border border-border bg-bg-elevated px-3.5 text-sm text-fg-muted hover:text-fg"
          >
            Try: {sample.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="raw-post">
            Group message
          </label>
          <Textarea
            id="raw-post"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste the WhatsApp listing here"
            className="min-h-80"
          />
          <label className="mt-2 text-sm font-medium" htmlFor="group">
            Source group
          </label>
          <select
            id="group"
            className="h-11 rounded-md border border-border bg-bg-elevated px-3 text-sm"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {(groupsQuery.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl tracking-tight">Read from the post</h2>
            <span className="text-xs text-fg-subtle">{Math.round(parsed.confidence * 100)}% parsed</span>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Title" value={parsed.title} />
            <Row label="Area" value={parsed.area || "Not found"} />
            <Row label="Neighbourhood" value={parsed.neighborhood || "—"} />
            <Row
              label="Type"
              value={`${PROPERTY_TYPES.find((t) => t.value === parsed.propertyType)?.label} · ${parsed.bedrooms} bed · ${parsed.bathrooms} bath`}
            />
            <Row label="Rent" value={parsed.rentAnnual ? `${formatNaira(parsed.rentAnnual)} / year` : "Not found"} />
            <Row label="Agency" value={parsed.agencyFee ? formatNaira(parsed.agencyFee) : "—"} />
            <Row label="Legal" value={parsed.legalFee ? formatNaira(parsed.legalFee) : "—"} />
            <Row label="Service charge" value={parsed.serviceCharge ? formatNaira(parsed.serviceCharge) : "—"} />
          </dl>
          {parsed.amenities.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {parsed.amenities.map((a) => (
                <span key={a} className="rounded-full bg-bg-subtle px-2.5 py-1 text-xs text-fg-muted">
                  {a}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-sm font-medium">Photo</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {IMAGE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setImageKey(key)}
                  className={cn(
                    "overflow-hidden rounded-sm ring-2 transition-shadow",
                    imageKey === key ? "ring-accent" : "ring-transparent",
                  )}
                >
                  <img src={listingImageSrc(key)} alt="" className="aspect-square object-cover" />
                </button>
              ))}
            </div>
          </div>

          {!parsed.area || !AREAS.includes(parsed.area as (typeof AREAS)[number]) ? (
            <p className="mt-4 text-sm text-fg-muted">Area was unclear. Check the post includes a Lagos neighbourhood.</p>
          ) : null}

          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

          <Button className="mt-6 w-full" size="lg" onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? "Publishing…" : "Publish to Letlist"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
