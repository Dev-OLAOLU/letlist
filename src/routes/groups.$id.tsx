import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ListingCard, ListingCardSkeleton } from "@/components/listing-card";
import { listGroups, searchListings } from "@/lib/listing-api";

export const Route = createFileRoute("/groups/$id")({
  loader: async ({ params }) => {
    const [groups, listings] = await Promise.all([
      listGroups(),
      searchListings({ data: { groupId: params.id, status: "available", sort: "newest" } }),
    ]);
    return { groups, listings };
  },
  component: GroupFeedPage,
});

function GroupFeedPage() {
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    initialData: initial.groups,
  });
  const listingsQuery = useQuery({
    queryKey: ["listings", { groupId: id }],
    queryFn: () => searchListings({ data: { groupId: id, status: "available", sort: "newest" } }),
    initialData: initial.listings,
  });

  const group = groupsQuery.data?.find((g) => g.id === id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/groups" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        All groups
      </Link>
      <h1 className="mt-4 font-display text-title tracking-tight sm:text-4xl">
        {group?.name ?? "Group feed"}
      </h1>
      <p className="mt-2 max-w-xl text-fg-muted">{group?.description}</p>
      <p className="mt-1 text-sm text-fg-subtle">
        {group?.areaFocus}
        {group?.watching ? " · Watching on the desk" : ""}
      </p>

      {listingsQuery.isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(listingsQuery.data?.listings ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </main>
  );
}
