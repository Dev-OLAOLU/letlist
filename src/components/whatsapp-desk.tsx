import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, ExternalLink, ImagePlus, MessageCircle, RefreshCw, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DESK_WHATSAPP,
  formatInboxPhone,
  isPlaceholderPhone,
  normalizeNgPhone,
} from "@/lib/listings";
import {
  addWatchedGroup,
  connectMetaCloud,
  connectWhatsappInbox,
  getWhatsappStatus,
  pullMetaInbox,
  saveMetaCloudKeys,
  saveWhatsappNumbers,
  setGroupWatching,
  syncWatchedGroups,
  testWhatsappWebhook,
  type IngestSummary,
} from "@/lib/whatsapp-sync";
import { SAMPLE_POSTS } from "@/lib/whatsapp-parser";
import { IMAGE_MAX_BYTES, MEDIA_PER_LISTING, VIDEO_MAX_BYTES, kindFromMime } from "@/lib/whatsapp-media-kind";
import { cn } from "@/lib/utils";

type Status = Awaited<ReturnType<typeof getWhatsappStatus>>;

function summarize(pulled: IngestSummary[]): string {
  const published = pulled.filter((p) => p.action === "published").length;
  const updated = pulled.filter((p) => p.action === "updated").length;
  const ignored = pulled.filter((p) => p.action === "ignored").length;
  const duplicate = pulled.filter((p) => p.action === "duplicate").length;
  const media = pulled.reduce((n, p) => n + (p.mediaCount ?? 0), 0);
  const parts: string[] = [];
  if (updated) parts.push(`${updated} updated`);
  if (published) parts.push(`${published} new`);
  if (duplicate) parts.push(`${duplicate} already in`);
  if (ignored) parts.push(`${ignored} skipped`);
  if (media) parts.push(`${media} photo${media === 1 ? "" : "s"}/video${media === 1 ? "" : "s"}`);
  if (parts.length === 0) return "No new posts in watched groups.";
  return `Read ${pulled.length} posts · ${parts.join(" · ")}`;
}

function mediaFlash(count?: number): string {
  if (!count) return "";
  return count === 1 ? " · 1 photo/video on the card" : ` · ${count} photos/videos on the card`;
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
      <p className="mt-1 break-all font-medium tabular-nums">{value || "—"}</p>
    </div>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-accent text-accent-fg" : "bg-bg-subtle text-fg-subtle",
        )}
        aria-hidden
      >
        {ok ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-fg-subtle" />}
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-fg-muted">{detail}</p>
      </div>
    </li>
  );
}

export function WhatsappDesk({ initial }: { initial: Status }) {
  const queryClient = useQueryClient();
  const [groupName, setGroupName] = useState("");
  const [areaFocus, setAreaFocus] = useState("");
  const [forward, setForward] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handshake, setHandshake] = useState<"idle" | "ok" | "fail">("idle");
  const [handshakeNote, setHandshakeNote] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => getWhatsappStatus(),
    initialData: initial,
    refetchInterval: 20_000,
  });

  const data = statusQuery.data ?? initial;
  const connected = data.connection.connected;
  const savedInbox = data.connection.inboxPhone || DESK_WHATSAPP;
  const savedAgent = data.connection.agentPhone || savedInbox;
  const inboxReady = !isPlaceholderPhone(savedInbox);
  const agentReady = !isPlaceholderPhone(savedAgent);

  const [inboxDraft, setInboxDraft] = useState(() =>
    inboxReady ? formatInboxPhone(savedInbox) : "",
  );
  const [agentDraft, setAgentDraft] = useState(() =>
    agentReady ? formatInboxPhone(savedAgent) : "",
  );
  const [tokenDraft, setTokenDraft] = useState("");
  const [phoneIdDraft, setPhoneIdDraft] = useState(initial.meta?.phoneNumberId ?? "");
  const [wabaDraft, setWabaDraft] = useState(initial.meta?.wabaId ?? "");
  const [appSecretDraft, setAppSecretDraft] = useState("");

  const [liveOrigin, setLiveOrigin] = useState("");
  useEffect(() => {
    setLiveOrigin(window.location.origin);
  }, []);

  const webhookPath = data.cloud?.webhookPath ?? "/api/whatsapp/webhook";
  const webhookUrl = data.cloud?.webhookUrl || (liveOrigin ? `${liveOrigin}${webhookPath}` : webhookPath);
  const verifyToken = data.cloud?.verifyToken || data.cloud?.verifyTokenDefault || "letlist-whatsapp";

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] }),
      queryClient.invalidateQueries({ queryKey: ["groups"] }),
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
      queryClient.invalidateQueries({ queryKey: ["area-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["desk-phones"] }),
    ]);
  };

  const saveNumbers = useMutation({
    mutationFn: () =>
      saveWhatsappNumbers({
        data: {
          inboxPhone: inboxDraft,
          agentPhone: agentDraft || inboxDraft,
        },
      }),
    onSuccess: async (result) => {
      setError(null);
      setFlash(`Saved inbox ${formatInboxPhone(result.inboxPhone)}.`);
      setInboxDraft(formatInboxPhone(result.inboxPhone));
      setAgentDraft(formatInboxPhone(result.agentPhone));
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save numbers."),
  });

  const saveKeys = useMutation({
    mutationFn: () =>
      saveMetaCloudKeys({
        data: {
          accessToken: tokenDraft || undefined,
          phoneNumberId: phoneIdDraft || undefined,
          wabaId: wabaDraft || undefined,
          appSecret: appSecretDraft || undefined,
        },
      }),
    onSuccess: async (result) => {
      setError(null);
      setTokenDraft("");
      setAppSecretDraft("");
      setPhoneIdDraft(result.phoneNumberId);
      setFlash(`Meta keys stored on this machine · token ending ${result.tokenTail}.`);
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not store Meta keys."),
  });

  const connectMeta = useMutation({
    mutationFn: () =>
      connectMetaCloud({
        data: {
          accessToken: tokenDraft || undefined,
          phoneNumberId: phoneIdDraft || undefined,
          wabaId: wabaDraft || undefined,
          appSecret: appSecretDraft || undefined,
        },
      }),
    onSuccess: async (result) => {
      setError(null);
      setTokenDraft("");
      setAppSecretDraft("");
      setPhoneIdDraft(result.phoneNumberId);
      setFlash(
        result.verifiedName
          ? `Connected ${result.verifiedName}${result.displayPhone ? ` · ${result.displayPhone}` : ""}. ${result.note}`
          : result.note,
      );
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not connect Meta."),
  });

  const pullMeta = useMutation({
    mutationFn: () => pullMetaInbox(),
    onSuccess: async (result) => {
      setError(null);
      setFlash(result.note);
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Pull failed."),
  });

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
    mutationFn: async () => {
      const form = new FormData();
      form.set("body", forward);
      for (const file of files) form.append("media", file);
      const res = await fetch("/api/whatsapp/ingest", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as (IngestSummary & { error?: string }) | null;
      if (!res.ok) throw new Error(json?.error || "Could not ingest that post.");
      if (!json) throw new Error("Could not ingest that post.");
      return json;
    },
    onSuccess: async (result) => {
      setError(null);
      setForward("");
      setFiles([]);
      setFlash(
        result.action === "updated"
          ? `Updated ${result.title ?? "listing"} from ${result.groupName}${mediaFlash(result.mediaCount)}`
          : result.action === "published"
            ? `Published ${result.title ?? "listing"} from ${result.groupName}${mediaFlash(result.mediaCount)}`
            : `${result.reason ?? "Post read."}${mediaFlash(result.mediaCount)}`,
      );
      await invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not ingest that post."),
  });

  const addFiles = (incoming: File[]) => {
    const next: File[] = [];
    const notes: string[] = [];
    for (const file of incoming) {
      const kind = kindFromMime(file.type);
      if (!kind) {
        notes.push(`${file.name} is not a photo or video Letlist can show.`);
        continue;
      }
      const cap = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
      if (file.size > cap) {
        notes.push(kind === "video" ? `${file.name} is over 16MB.` : `${file.name} is over 8MB.`);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MEDIA_PER_LISTING) {
        notes.push("Up to 12 photos/videos per listing.");
        return merged.slice(0, MEDIA_PER_LISTING);
      }
      return merged;
    });
    if (notes.length) setError(notes[0] ?? null);
    else setError(null);
  };

  const watchingCount = data.groups.filter((g) => g.watching).length;
  const cloudReady = Boolean(data.cloud?.configured);
  const meta = data.meta;
  const metaLinked = Boolean(meta?.linked);
  const pullerRunning = Boolean(meta?.pullerRunning);
  const metaKeysReady = Boolean(
    (tokenDraft.trim() || meta?.hasToken) && (phoneIdDraft.replace(/\D/g, "") || meta?.phoneNumberId),
  );

  const numbersValid = useMemo(
    () => Boolean(normalizeNgPhone(inboxDraft) && normalizeNgPhone(agentDraft || inboxDraft)),
    [inboxDraft, agentDraft],
  );

  const runHandshake = async () => {
    setHandshakeNote(null);
    try {
      const local = await fetch(
        `${webhookPath}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=letlist-ok`,
      );
      const body = (await local.text()).trim();
      if (local.ok && body === "letlist-ok") {
        setHandshake("ok");
        setHandshakeNote("Letlist answered Meta’s handshake. Paste the callback URL into Meta and tap Verify and save.");
        return;
      }
    } catch {
      /* fall through to server probe */
    }
    try {
      const remote = await testWhatsappWebhook({ data: { origin: liveOrigin } });
      setHandshake(remote.ok ? "ok" : "fail");
      setHandshakeNote(remote.reason);
    } catch (err) {
      setHandshake("fail");
      setHandshakeNote(err instanceof Error ? err.message : "Handshake failed.");
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">Data centre</p>
            <h2 className="mt-2 font-display text-2xl tracking-tight">
              {connected ? "WhatsApp hub live" : "Connect Meta WhatsApp"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {connected ? (
              <Badge className="border-accent/30 bg-accent text-accent-fg">Desk live</Badge>
            ) : (
              <Badge>Desk idle</Badge>
            )}
            {cloudReady || metaLinked ? (
              <Badge className="border-accent/30 bg-accent text-accent-fg">Cloud API</Badge>
            ) : (
              <Badge>Cloud API pending</Badge>
            )}
            {pullerRunning ? (
              <Badge className="border-accent/30 bg-accent text-accent-fg">Puller on</Badge>
            ) : (
              <Badge>Puller idle</Badge>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-fg-muted">
          This machine is the Meta puller — the data centre sits on your registered Cloud API number. Paste the
          access token and Phone number ID from API Setup, then Connect Meta. Housing groups still cannot be joined
          by Cloud API: forward those posts (text, photos, and videos) to the inbox and the puller reads them here.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Cloud API inbox number</span>
            <span className="mt-1 block text-sm text-fg-muted">
              The Meta-registered business number. Forward group posts to this line.
            </span>
            <Input
              className="mt-2"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0803 000 0000"
              value={inboxDraft}
              onChange={(e) => setInboxDraft(e.target.value)}
              aria-label="Cloud API inbox number"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Your WhatsApp (groups + clients)</span>
            <span className="mt-1 block text-sm text-fg-muted">
              The number already in the housing groups. Clients tap this on a listing.
            </span>
            <Input
              className="mt-2"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0802 000 0000"
              value={agentDraft}
              onChange={(e) => setAgentDraft(e.target.value)}
              aria-label="Personal WhatsApp number"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => saveNumbers.mutate()}
            disabled={saveNumbers.isPending || !numbersValid}
          >
            {saveNumbers.isPending ? "Saving…" : "Save numbers"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-fg-muted">On this machine</p>
            <h2 className="mt-2 font-display text-xl tracking-tight">
              {metaLinked ? `Meta line · ${meta?.verifiedName || "connected"}` : "Connect the Meta CLI"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">
              From{" "}
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-fg underline-offset-2 hover:underline"
              >
                Meta Developers
              </a>{" "}
              → your app → WhatsApp → API Setup. Copy Temporary (or system user) access token and Phone number ID.
              Keys stay on this machine — they are never shown back in full.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
              API Setup
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="block lg:col-span-2">
            <span className="text-sm font-medium">Access token</span>
            <span className="mt-1 block text-sm text-fg-muted">
              {meta?.hasToken
                ? `Stored · ending ${meta.tokenTail}. Paste a new one only to replace it.`
                : "Permanent system-user token is best. Temporary tokens expire in 24 hours."}
            </span>
            <Input
              className="mt-2"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={meta?.hasToken ? "••••••••" : "EAAG…"}
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              aria-label="Meta access token"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Phone number ID</span>
            <span className="mt-1 block text-sm text-fg-muted">From API Setup, not the digits you dial.</span>
            <Input
              className="mt-2"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456789012345"
              value={phoneIdDraft}
              onChange={(e) => setPhoneIdDraft(e.target.value)}
              aria-label="Meta phone number ID"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">WhatsApp Business Account ID (optional)</span>
            <span className="mt-1 block text-sm text-fg-muted">Helps list Cloud API groups on this line.</span>
            <Input
              className="mt-2"
              inputMode="numeric"
              autoComplete="off"
              placeholder="WABA ID"
              value={wabaDraft}
              onChange={(e) => setWabaDraft(e.target.value)}
              aria-label="WhatsApp Business Account ID"
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="text-sm font-medium">App secret (optional)</span>
            <span className="mt-1 block text-sm text-fg-muted">
              App settings → Basic. Needed to verify inbound webhooks on a public site.
            </span>
            <Input
              className="mt-2"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={data.cloud?.hasAppSecret ? "••••••••" : "App secret"}
              value={appSecretDraft}
              onChange={(e) => setAppSecretDraft(e.target.value)}
              aria-label="Meta app secret"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            variant="whatsapp"
            onClick={() => connectMeta.mutate()}
            disabled={connectMeta.isPending || !metaKeysReady}
          >
            <Terminal className="size-4" />
            {connectMeta.isPending ? "Talking to Meta…" : metaLinked ? "Reconnect Meta" : "Connect Meta"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => saveKeys.mutate()}
            disabled={saveKeys.isPending || !metaKeysReady}
          >
            {saveKeys.isPending ? "Saving…" : "Save keys"}
          </Button>
          <Button
            variant="outline"
            onClick={() => pullMeta.mutate()}
            disabled={pullMeta.isPending || !meta?.hasToken}
          >
            <RefreshCw className={cn("size-4", pullMeta.isPending && "animate-spin")} />
            {pullMeta.isPending ? "Pulling…" : "Pull now"}
          </Button>
        </div>
        {meta?.displayPhone ? (
          <p className="mt-4 text-sm text-fg">
            {meta.verifiedName || "Business line"} · {meta.displayPhone}
            {meta.lastPullAt ? ` · last pull ${ago(meta.lastPullAt)}` : ""}
          </p>
        ) : null}
        {meta?.error ? <p className="mt-3 text-sm text-danger">{meta.error}</p> : null}
      </section>

      <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-tight">Hook Meta to this hub</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">
              In{" "}
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-fg underline-offset-2 hover:underline"
              >
                Meta Developers
              </a>
              , open your app → <span className="font-medium text-fg">WhatsApp → Configuration</span> (or Use cases →
              Customize → Configuration). Edit the webhook, paste the two fields, tap{" "}
              <span className="font-medium text-fg">Verify and save</span>, then Manage and subscribe to{" "}
              <span className="font-medium text-fg">messages</span>.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
              Open Meta
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <CopyField label="Callback URL" value={webhookUrl} />
          <CopyField label="Verify token" value={verifyToken} />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => void runHandshake()}>
            Test handshake
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`https://wa.me/${savedInbox}?text=${encodeURIComponent("Forward a listing post from your group to this Letlist inbox.")}`}
              target="_blank"
              rel="noreferrer"
            >
              Message the inbox
            </a>
          </Button>
        </div>
        {handshakeNote ? (
          <p className={cn("mt-4 text-sm", handshake === "fail" ? "text-danger" : "text-fg")}>{handshakeNote}</p>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">
            Meta only saves a webhook on a public HTTPS site (your live Letlist URL). This machine pulls outbound
            from Graph API instead — that is the data centre. The webhook is the production backup once Vercel is live.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
        <h2 className="font-display text-xl tracking-tight">Hub status</h2>
        <ul className="mt-4 space-y-3">
          <CheckRow
            ok={inboxReady}
            label="Inbox number"
            detail={inboxReady ? formatInboxPhone(savedInbox) : "Save the Meta-registered Cloud API number."}
          />
          <CheckRow
            ok={agentReady}
            label="Your WhatsApp"
            detail={agentReady ? formatInboxPhone(savedAgent) : "Save the number already in the housing groups."}
          />
          <CheckRow
            ok={metaLinked}
            label="Meta line"
            detail={
              metaLinked
                ? `${meta?.verifiedName || "Connected"}${meta?.displayPhone ? ` · ${meta.displayPhone}` : ""}`
                : "Paste access token + Phone number ID, then Connect Meta."
            }
          />
          <CheckRow
            ok={pullerRunning}
            label="Puller on this machine"
            detail={
              pullerRunning
                ? meta?.lastPullNote || "Watching the Meta inbox."
                : "The puller starts with Letlist and checks Meta every minute."
            }
          />
          <CheckRow
            ok={Boolean(meta?.hasToken && meta?.phoneNumberId)}
            label="Cloud API keys"
            detail={
              meta?.hasToken
                ? `Token ending ${meta.tokenTail} · ID ${meta.phoneNumberId}`
                : "Stored on this machine from the form above. Production can use the same values as environment variables."
            }
          />
          <CheckRow
            ok={handshake === "ok"}
            label="Webhook handshake"
            detail={handshake === "ok" ? "Letlist answered Meta’s verify request." : "Needed for the public site. Optional while this machine is pulling."}
          />
          <CheckRow
            ok={connected}
            label="Desk connected"
            detail={connected ? `Watching ${watchingCount} groups.` : "Connect Meta, or tap Connect WhatsApp to start watching groups."}
          />
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {connected ? (
            <>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => pullMeta.mutate()}
                disabled={pullMeta.isPending || !meta?.hasToken}
              >
                <RefreshCw className={cn("size-4", pullMeta.isPending && "animate-spin")} />
                {pullMeta.isPending ? "Pulling…" : "Pull from Meta"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => sync.mutate()}
                disabled={sync.isPending || watchingCount === 0}
              >
                {sync.isPending ? "Syncing…" : "Sync watched groups"}
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              variant="whatsapp"
              onClick={() => (metaKeysReady ? connectMeta.mutate() : connect.mutate())}
              disabled={connect.isPending || connectMeta.isPending || (!inboxReady && !metaKeysReady)}
            >
              <MessageCircle className="size-4" />
              {connect.isPending || connectMeta.isPending ? "Connecting…" : "Connect WhatsApp"}
            </Button>
          )}
        </div>
        {flash ? <p className="mt-4 text-sm text-fg">{flash}</p> : null}
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
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

        <div className="space-y-6">
          <section className="rounded-xl bg-bg-elevated p-5 ring-1 ring-border sm:p-6">
            <h2 className="font-display text-xl tracking-tight">Forward a post</h2>
            <p className="mt-2 text-sm text-fg-muted">
              From a watched group, forward the listing — photos and videos included — to the inbox, or paste here and
              attach the same files. They show on the search card instead of a stand-in photo.
            </p>
            <Textarea
              className="mt-4 min-h-44"
              value={forward}
              onChange={(e) => setForward(e.target.value)}
              placeholder="Forwarded from Lekki & Ajah Available Homes…"
              disabled={!connected}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.3gp,.mov"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            {files.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-border bg-bg px-3 text-sm"
                  >
                    {file.type.startsWith("video/") ? (
                      <span className="text-fg-subtle">Video</span>
                    ) : (
                      <span className="text-fg-subtle">Photo</span>
                    )}
                    <span className="max-w-36 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-full text-fg-muted hover:text-fg"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!connected || files.length >= MEDIA_PER_LISTING}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
                Add photos or video
              </Button>
              {SAMPLE_POSTS.slice(0, 2).map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  disabled={!connected}
                  onClick={() => setForward(sample.body)}
                  className="h-11 rounded-full border border-border bg-bg px-3.5 text-sm text-fg-muted hover:text-fg disabled:opacity-40"
                >
                  Try: {sample.label}
                </button>
              ))}
            </div>
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={!connected || ingest.isPending || (forward.trim().length < 12 && files.length === 0)}
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
