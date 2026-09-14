import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DESK_WHATSAPP, formatInboxPhone } from "@/lib/listings";
import {
  addWatchedGroup,
  connectWhatsappInbox,
  getWhatsappStatus,
  ingestForwardedPost,
  setGroupWatching,
  syncWatchedGroups,
  type IngestSummary,
} from "@/lib/whatsapp-sync";
import { SAMPLE_POSTS } from "@/lib/whatsapp-parser";
import { cn } from "@/lib/utils";

type Status = Awaited<ReturnType<typeof getWhatsappStatus>>;

function summarize(pulled: IngestSummary[]): string {
  const published = pulled.filter((p) => p.action === "published").length;
  const updated = pulled.filter((p) => p.action === "updated").length;
  const ignored = pulled.filter((p) => p.action === "ignored").length;
  const duplicate = pulled.filter((p) => p.action === "duplicate").length;
  const parts: string[] = [];
  if (updated) parts.push(`${updated} updated`);
  if (published) parts.push(`${published} new`);
  if (duplicate) parts.push(`${duplicate} already in`);
  if (ignored) parts.push(`${ignored} skipped`);
  if (parts.length === 0) return "No new posts in watched groups.";
  return `Read ${pulled.length} posts · ${parts.join(" · ")}`;
}

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return formatDistanceToNow(date, { addSuffix: true });
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-bg-subtle px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.12em] text-fg-subtle">{label}</p>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-sm text-fg-muted hover:text-fg"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* ignore */
            }
          }}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p className="mt-1 break-all font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function WhatsappDesk({ initial }: { initial: Status }) {
  const queryClient = useQueryClient();
  const [groupName, setGroupName] = useState("");
  const [areaFocus, setAreaFocus] = useState("");
  const [forward, setForward] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => getWhatsappStatus(),
    initialData: initial,
  });

  const data = statusQuery.data ?? initial;
  const connected = data.connection.connected;
  const phone = formatInboxPhone(data.connection.inboxPhone || DESK_WHATSAPP);
  const webhookUrl =
    data.cloud?.webhookUrl ||
    (typeof window !== "undefined" ? `${window.location.origin}${data.cloud?.webhookPath ?? "/api/whatsapp/webhook"}` : "/api/whatsapp/webhook");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
      queryClient.invalidateQueries({ queryKey: ["groups"] }),
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
      queryClient.invalidateQueries({ queryKey: ["area-stats"] }),
    ]);
  };

  const connect = useMutation({
    mutationFn: () => connectWhatsappInbox(),
    onSuccess: async (result) => {
      setError(null);
      setFlash(summarize(result.pulled));
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not connect."),
  });

  const sync = useMutation({
    mutationFn: () => syncWatchedGroups(),
    onSuccess: async (result) => {
      setError(null);
      setFlash(summarize(result.pulled));
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not sync."),
  });

  const watch = useMutation({
    mutationFn: (input: { id: string; watching: boolean }) => setGroupWatching({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });

  const addGroup = useMutation({
    mutationFn: () => addWatchedGroup({ data: { name: groupName, areaFocus } }),
    onSuccess: async () => {
      setGroupName("");
      setAreaFocus("");
      setError(null);
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not add group."),
  });

  const ingest = useMutation({
    mutationFn: () => ingestForwardedPost({ data: { body: forward } }),
    onSuccess: async (result) => {
      setError(null);
      setForward("");
      setFlash(
        result.action === "updated"
          ? `Updated ${result.title ?? "listing"} from ${result.groupName}`
          : result.action === "published"
            ? `Published ${result.title ?? "listing"} from ${result.groupName}`
            : result.reason ?? "Post read.",
      );
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not ingest that post."),
  });

  const watchingCount = data.groups.filter((g) => g.watching).length;

  return (
    <div className="mt-8 space-y-6">
      <ol className="grid gap-3 lg:grid-cols-4">
        <Step n="1" title="Create the inbox number">
          In Meta Developers, create an app, add the WhatsApp product, and register a business phone. That number is the Letlist inbox. WhatsApp will not let this number join the housing groups you already belong to.
        </Step>
        <Step n="2" title="Hook Meta to Letlist">
          WhatsApp → Configuration. Callback URL and verify token below. Subscribe to <span className="font-medium text-fg">messages</span>. On Vercel set the same verify token plus your access token, app secret, phone number ID, and Neon database URL.
        </Step>
        <Step n="3" title="Connect this desk">
          Tap Connect WhatsApp, then watch every group you work in. Letlist only publishes posts from watched groups.
        </Step>
        <Step n="4" title="Forward every listing">
          When a post lands in a group, forward it to the inbox number. Start with the group name if it is missing. Same unit is updated when the rent changes — no duplicate cards.
        </Step>
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">Inbox</p>
                <h2 className="mt-2 font-display text-2xl tracking-tight">
                  {connected ? "WhatsApp connected" : "Connect WhatsApp"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {connected ? (
                  <Badge className="border-accent/30 bg-accent text-accent-fg">Desk live</Badge>
                ) : (
                  <Badge>Desk idle</Badge>
                )}
                {data.cloud?.configured ? (
                  <Badge className="border-accent/30 bg-accent text-accent-fg">Cloud API</Badge>
                ) : (
                  <Badge>Cloud API pending</Badge>
                )}
              </div>
            </div>
            <p className="mt-3 max-w-xl text-sm text-fg-muted">
              {data.cloud?.configured
                ? "Cloud API is wired. Forwarded posts to this inbox land on the search hub automatically."
                : "Connect the desk now so watching works. Add Cloud API keys on Vercel when the Meta app is ready — listings still ingest from forwards and sync."}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <CopyField label="Inbox number" value={phone} />
              <div className="rounded-lg bg-bg-subtle px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-fg-subtle">Last post read</p>
                <p className="mt-1 font-medium">{ago(data.connection.lastInboundAt)}</p>
              </div>
              <CopyField label="Callback URL" value={webhookUrl} />
              <CopyField label="Verify token" value={data.cloud?.verifyTokenDefault ?? "letlist-whatsapp"} />
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {connected ? (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending || watchingCount === 0}
                >
                  <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
                  {sync.isPending ? "Syncing…" : "Sync watched groups"}
                </Button>
              ) : (
                <Button size="lg" variant="whatsapp" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  <MessageCircle className="size-4" />
                  {connect.isPending ? "Connecting…" : "Connect WhatsApp"}
                </Button>
              )}
              <Button size="lg" variant="outline" asChild>
                <a
                  href={`https://wa.me/${data.connection.inboxPhone || DESK_WHATSAPP}?text=${encodeURIComponent("Forward a listing post from your group to this Letlist inbox.")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Message the inbox
                </a>
              </Button>
            </div>
            {flash ? <p className="mt-4 text-sm text-fg">{flash}</p> : null}
            {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl tracking-tight">Groups to watch</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {connected
                    ? `${watchingCount} watched. Only these chats publish to Search.`
                    : "Connect first. Letlist will watch every group on this list."}
                </p>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border">
              {data.groups.map((group) => (
                <li key={group.id} className="flex items-center gap-4 bg-bg-elevated px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{group.name}</p>
                    <p className="mt-0.5 text-sm text-fg-subtle">
                      {group.areaFocus}
                      <span className="text-fg-subtle"> · {group.listingCount} live</span>
                      {group.lastSyncedAt ? ` · synced ${ago(group.lastSyncedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-fg-subtle sm:inline">
                      {group.watching ? "Watching" : "Off"}
                    </span>
                    <Switch
                      checked={group.watching}
                      disabled={!connected || watch.isPending}
                      onCheckedChange={(next) => watch.mutate({ id: group.id, watching: next })}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (groupName.trim().length >= 3) addGroup.mutate();
              }}
            >
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name, e.g. Lekki Phase 2 Lets"
                aria-label="Group name"
                disabled={!connected}
              />
              <Input
                value={areaFocus}
                onChange={(e) => setAreaFocus(e.target.value)}
                placeholder="Area focus"
                aria-label="Area focus"
                className="sm:max-w-40"
                disabled={!connected}
              />
              <Button type="submit" variant="secondary" disabled={!connected || addGroup.isPending || groupName.trim().length < 3}>
                Add group
              </Button>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
            <h2 className="font-display text-xl tracking-tight">Forward a post</h2>
            <p className="mt-2 text-sm text-fg-muted">
              Paste a message forwarded from a watched group. Letlist updates the same unit when rent or fees change.
            </p>
            <Textarea
              className="mt-4 min-h-44"
              value={forward}
              onChange={(e) => setForward(e.target.value)}
              placeholder="Forwarded from Lekki & Ajah Available Homes…"
              disabled={!connected}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_POSTS.slice(0, 2).map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  disabled={!connected}
                  onClick={() => setForward(sample.body)}
                  className="h-10 rounded-full border border-border bg-bg px-3.5 text-sm text-fg-muted hover:text-fg disabled:opacity-40"
                >
                  Try: {sample.label}
                </button>
              ))}
            </div>
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={!connected || ingest.isPending || forward.trim().length < 12}
              onClick={() => ingest.mutate()}
            >
              {ingest.isPending ? "Reading…" : "Read into Letlist"}
            </Button>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Inbox log</h2>
            {data.inbox.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">
                Nothing ingested yet. Connect WhatsApp, then forward a listing or sync watched groups.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.inbox.map((item) => (
                  <li key={item.id} className="rounded-lg bg-bg-elevated px-4 py-3 ring-1 ring-border">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{item.groupName}</p>
                      <InboxStatus status={item.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.body}</p>
                    <p className="mt-2 text-xs text-fg-subtle">
                      {ago(item.receivedAt)}
                      {item.listingId ? (
                        <>
                          {" · "}
                          <Link to="/listings/$id" params={{ id: item.listingId }} className="underline-offset-2 hover:underline">
                            Open listing
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Step {n}</p>
      <p className="mt-2 font-display text-lg tracking-tight">{title}</p>
      <p className="mt-2 text-sm text-fg-muted">{children}</p>
    </li>
  );
}

function InboxStatus({ status }: { status: string }) {
  const label =
    status === "published"
      ? "New"
      : status === "updated"
        ? "Updated"
        : status === "duplicate"
          ? "Already in"
          : status === "ignored"
            ? "Skipped"
            : status;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]",
        status === "published" || status === "updated"
          ? "bg-accent text-accent-fg"
          : "bg-bg-subtle text-fg-muted",
      )}
    >
      {label}
    </span>
  );
}
