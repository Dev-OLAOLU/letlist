import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { listGroups } from "@/lib/listing-api";

export const Route = createFileRoute("/groups")({
  loader: () => listGroups(),
  component: GroupsPage,
});

function GroupsPage() {
  const initial = Route.useLoaderData();
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    initialData: initial,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">Sources</p>
      <h1 className="mt-3 font-display text-display tracking-tight">The groups</h1>
      <p className="mt-4 max-w-xl text-fg-muted">
        Every listing on Letlist is attributed to the WhatsApp group it was posted in. Watch a group from the
        desk so new posts and price changes land here automatically.
      </p>
      <p className="mt-3">
        <Link to="/desk" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          Connect WhatsApp on the desk
        </Link>
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {(groupsQuery.data ?? []).map((group) => (
          <Link
            key={group.id}
            to="/groups/$id"
            params={{ id: group.id }}
            className="rounded-xl bg-bg-elevated p-6 ring-1 ring-border transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-2xl tracking-tight">{group.name}</p>
              {group.watching ? (
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-accent-fg">
                  Watching
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-fg-muted">{group.areaFocus}</p>
            <p className="mt-4 text-sm text-fg-subtle">{group.description}</p>
            <p className="mt-6 text-sm font-medium">
              {group.listingCount} live {group.listingCount === 1 ? "listing" : "listings"}
              {group.lastSyncedAt
                ? ` · synced ${formatDistanceToNow(new Date(group.lastSyncedAt), { addSuffix: true })}`
                : ""}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
