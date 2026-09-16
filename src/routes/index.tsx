import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterChip } from "@/components/filter-chip";
import { ListingCard, ListingCardSkeleton } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREAS, BUDGETS, DESK_WHATSAPP, searchShareText } from "@/lib/listings";
import { areaStats, listGroups, searchListings } from "@/lib/listing-api";
import { compactSearch, parseSearch, toFilters, type SearchInput } from "@/lib/search-params";
import { getDeskPhones } from "@/lib/whatsapp-sync";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => parseSearch(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const filters = toFilters(deps);
    const [listings, areas, groups, phones] = await Promise.all([
      searchListings({ data: filters }),
      areaStats(),
      listGroups(),
      getDeskPhones(),
    ]);
    return { listings, areas, groups, phones };
  },
  component: Home,
});

const BED_CHIPS: { label: string; value?: string }[] = [
  { label: "Any beds" },
  { label: "SC / studio", value: "sc" },
  { label: "1 bed", value: "1" },
  { label: "2 bed", value: "2" },
  { label: "3 bed", value: "3" },
  { label: "4+", value: "4plus" },
];

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const initial = Route.useLoaderData();
  const [draft, setDraft] = useState(search.q ?? "");
  const [copied, setCopied] = useState(false);

  const filters = useMemo(() => toFilters(search), [search]);

  const listingsQuery = useQuery({
    queryKey: ["listings", filters],
    queryFn: () => searchListings({ data: filters }),
    initialData: initial.listings,
  });
  const areasQuery = useQuery({
    queryKey: ["area-stats"],
    queryFn: () => areaStats(),
    initialData: initial.areas,
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    initialData: initial.groups,
  });

  const setSearch = (patch: Partial<SearchInput>) => {
    void navigate({
      search: compactSearch({ ...search, ...patch }),
    });
  };

  const listings = listingsQuery.data?.listings ?? [];
  const total = listingsQuery.data?.total ?? 0;
  const hasFilters = Boolean(
    search.q || search.area || search.beds || search.min || search.max || search.type || search.group,
  );

  const copyLink = async () => {
    const url = window.location.href;
    const text = `${searchShareText(filters, total)}\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const shareWhatsapp = () => {
    const url = window.location.href;
    const text = `${searchShareText(filters, total)}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noreferrer");
  };

  return (
    <main>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">
            WhatsApp apartments, searchable
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-display tracking-tight text-fg">
            From the groups. For your clients.
          </h1>
          <p className="mt-4 max-w-xl text-base text-fg-muted sm:text-lg">
            Letlist is the desk between Lagos WhatsApp housing groups and the people who message you looking for a place.
          </p>

          <form
            className="mt-8 flex flex-col gap-2 rounded-xl bg-bg-elevated p-2 ring-1 ring-border sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch({ q: draft || undefined });
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search Lekki, self contain, ensuite, inverter…"
                className="border-0 bg-transparent pl-10 shadow-none ring-0 focus-visible:ring-0"
                aria-label="Search listings"
              />
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Search
            </Button>
          </form>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {BED_CHIPS.map((chip) => (
              <FilterChip
                key={chip.label}
                active={(search.beds ?? undefined) === chip.value}
                onClick={() => setSearch({ beds: chip.value })}
              >
                {chip.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex gap-2 overflow-x-auto pb-2 pt-8">
          {AREAS.map((area) => {
            const stat = areasQuery.data?.find((s) => s.area === area);
            const active = search.area === area;
            return (
              <FilterChip
                key={area}
                active={active}
                onClick={() => setSearch({ area: active ? undefined : area })}
              >
                {area}
                {stat ? ` · ${stat.count}` : ""}
              </FilterChip>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-title tracking-tight">
              {hasFilters ? `${total} matching` : `${total} live listings`}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {search.group
                ? groupsQuery.data?.find((g) => g.id === search.group)?.name
                : "Pulled from six WhatsApp groups your desk already watches."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-11 rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg"
              value={search.sort ?? "newest"}
              onChange={(e) => setSearch({ sort: e.target.value === "newest" ? undefined : e.target.value })}
              aria-label="Sort listings"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Lowest rent</option>
              <option value="price-desc">Highest rent</option>
            </select>
            <Button variant="outline" onClick={copyLink}>
              <Copy className="size-4" />
              {copied ? "Copied" : "Copy for client"}
            </Button>
            <Button variant="secondary" onClick={shareWhatsapp}>
              Send search
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {BUDGETS.map((b) => {
            const active = search.min === (b.min ? String(b.min) : undefined) && search.max === (b.max ? String(b.max) : undefined);
            const nextMin = "min" in b && b.min ? String(b.min) : undefined;
            const nextMax = "max" in b && b.max ? String(b.max) : undefined;
            return (
              <FilterChip
                key={b.label}
                active={active}
                onClick={() =>
                  setSearch({
                    min: active ? undefined : nextMin,
                    max: active ? undefined : nextMax,
                  })
                }
              >
                {b.label}
              </FilterChip>
            );
          })}
          {hasFilters ? (
            <FilterChip
              onClick={() => {
                setDraft("");
                void navigate({ search: {} });
              }}
            >
              Clear
            </FilterChip>
          ) : null}
        </div>

        {listingsQuery.isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-bg-elevated px-6 py-16 text-center">
            <p className="font-display text-xl tracking-tight">Nothing live for that search.</p>
            <p className="mt-2 text-sm text-fg-muted">Widen the area or paste a fresh post from a group on the desk.</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={() => void navigate({ search: {} })}>
                Reset search
              </Button>
              <Button asChild>
                <Link to="/desk">Open desk</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <aside className="mt-14 grid gap-6 rounded-xl bg-accent px-6 py-8 text-accent-fg sm:grid-cols-[1fr_auto] sm:items-center sm:px-10">
          <div>
            <h2 className="font-display text-2xl tracking-tight">A client just asked for 2 beds in Lekki under 5m.</h2>
            <p className="mt-2 max-w-xl text-sm text-accent-fg/80">
              Filter, copy the search, and drop it on WhatsApp. They browse. You inspect.
            </p>
          </div>
          <a
            href={`https://wa.me/${initial.phones?.agentPhone || DESK_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-bg px-5 text-sm font-medium text-fg"
          >
            Message the desk
            <ArrowUpRight className="size-4" />
          </a>
        </aside>
      </section>
    </main>
  );
}
