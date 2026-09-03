"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostSource, PostStatus, MediaType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge, Field, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { POST_STATUS_LABEL, POST_STATUS_TONE, mediaUrl, formatTime, formatDateTime } from "@/lib/display";
import { cancelScheduledPost, createManualPost, updateScheduledPost } from "./actions";

export type CalPost = {
  id: string;
  scheduledAt: string;
  status: PostStatus;
  source: PostSource;
  caption: string | null;
  mediaId: string;
  mediaName: string;
  mediaType: MediaType;
  account: string;
  category: string | null;
  automationName: string | null;
  errorMessage: string | null;
  instagramMediaId: string | null;
};
export type PickMedia = { id: string; name: string; type: MediaType; caption: string | null };
type Account = { id: string; username: string };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CalendarClient({
  year,
  month,
  posts,
  accounts,
  media,
  timezone,
}: {
  year: number;
  month: number;
  posts: CalPost[];
  accounts: Account[];
  media: PickMedia[];
  timezone: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalPost | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // ISO date yyyy-mm-dd

  const byDay = useMemo(() => {
    const map = new Map<string, CalPost[]>();
    for (const p of posts) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(p.scheduledAt));
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [posts, timezone]);

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(firstOfMonth);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/calendario?month=${prev}`} className="rounded border bg-white px-2.5 py-1.5 text-sm">
            ←
          </Link>
          <span className="min-w-40 text-center font-medium capitalize">{monthLabel}</span>
          <Link href={`/calendario?month=${next}`} className="rounded border bg-white px-2.5 py-1.5 text-sm">
            →
          </Link>
        </div>
        <Button onClick={() => setCreating(todayKey)} disabled={accounts.length === 0}>
          Agendar publicação
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-px rounded-[var(--radius)] border bg-[var(--color-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-[var(--color-surface)] p-2 text-center text-xs font-medium text-[var(--color-muted)]">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            const key = day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            const dayPosts = day ? byDay.get(key) ?? [] : [];
            return (
              <div key={i} className="min-h-28 bg-[var(--color-surface)] p-1.5">
                {day && (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`text-xs ${key === todayKey ? "font-bold text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
                        {day}
                      </span>
                      <button
                        onClick={() => setCreating(key)}
                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]"
                        title="Agendar neste dia"
                      >
                        +
                      </button>
                    </div>
                    <div className="space-y-1">
                      {dayPosts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelected(p)}
                          className="flex w-full items-center gap-1 rounded bg-[var(--color-bg)] p-1 text-left text-xs hover:bg-black/5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaUrl(p.mediaId, "thumb")} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{formatTime(p.scheduledAt, timezone)} {p.mediaName}</span>
                          </span>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor(p.status)}`} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Legend />

      {selected && (
        <PostDetail
          post={selected}
          media={media}
          timezone={timezone}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
      {creating && (
        <NewPost
          date={creating}
          accounts={accounts}
          media={media}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function dotColor(s: PostStatus) {
  return {
    DRAFT: "bg-gray-400",
    SCHEDULED: "bg-blue-500",
    PROCESSING: "bg-amber-500",
    PUBLISHED: "bg-green-500",
    FAILED: "bg-red-500",
    CANCELLED: "bg-gray-300",
  }[s];
}

function Legend() {
  const items: PostStatus[] = ["SCHEDULED", "PROCESSING", "PUBLISHED", "FAILED", "CANCELLED", "DRAFT"];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dotColor(s)}`} /> {POST_STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function PostDetail({
  post,
  media,
  timezone,
  onClose,
  onChanged,
}: {
  post: CalPost;
  media: PickMedia[];
  timezone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [mediaId, setMediaId] = useState(post.mediaId);
  const [when, setWhen] = useState(toLocalInput(post.scheduledAt, timezone));

  const editable = ["DRAFT", "SCHEDULED", "FAILED"].includes(post.status);

  function save() {
    start(async () => {
      const res = await updateScheduledPost({
        id: post.id,
        caption: caption.trim() ? caption : null,
        mediaAssetId: mediaId !== post.mediaId ? mediaId : undefined,
        scheduledAt: when ? fromLocalInput(when, timezone) : undefined,
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Publicação atualizada", "success");
      onChanged();
    });
  }

  function cancel() {
    if (!confirm("Cancelar esta publicação?")) return;
    start(async () => {
      const res = await cancelScheduledPost({ id: post.id });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Publicação cancelada", "success");
      onChanged();
    });
  }

  return (
    <Modal open onClose={onClose} title="Detalhes da publicação" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-[var(--radius)] border bg-[var(--color-bg)]">
            {post.mediaType === "VIDEO" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={mediaUrl(mediaId, "preview")} controls className="max-h-72 w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(mediaId, "preview")} alt="" className="max-h-72 w-full object-contain" />
            )}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={POST_STATUS_TONE[post.status]}>{POST_STATUS_LABEL[post.status]}</Badge>
              <Badge tone={post.source === "AUTOMATION" ? "primary" : "neutral"}>
                {post.source === "AUTOMATION" ? `Automática${post.automationName ? ` · ${post.automationName}` : ""}` : "Manual"}
              </Badge>
            </div>
            <div className="text-[var(--color-muted)]">Conta: @{post.account}</div>
            {post.category && <div className="text-[var(--color-muted)]">Categoria: {post.category}</div>}
            <div className="text-[var(--color-muted)]">Agendada: {formatDateTime(post.scheduledAt, timezone)}</div>
            {post.instagramMediaId && (
              <div className="text-[var(--color-muted)]">ID no Instagram: {post.instagramMediaId}</div>
            )}
            {post.errorMessage && <div className="rounded bg-red-50 p-2 text-xs text-red-800">{post.errorMessage}</div>}
          </div>
        </div>

        <div>
          {editable ? (
            <>
              <Field label="Trocar mídia">
                <Select value={mediaId} onChange={(e) => setMediaId(e.target.value)}>
                  {media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.type === "VIDEO" ? "🎬" : "🖼"} {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data e hora">
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="h-10 w-full rounded-[var(--radius)] border bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Legenda desta publicação" hint="Não altera a legenda padrão da mídia.">
                <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
              </Field>
              <div className="mt-2 flex justify-between">
                <Button variant="danger" onClick={cancel} disabled={pending}>
                  Cancelar publicação
                </Button>
                <Button onClick={save} disabled={pending}>
                  Salvar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              Esta publicação está {POST_STATUS_LABEL[post.status].toLowerCase()} e não pode mais ser editada.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function NewPost({
  date,
  accounts,
  media,
  onClose,
  onCreated,
}: {
  date: string;
  accounts: Account[];
  media: PickMedia[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [mediaId, setMediaId] = useState(media[0]?.id ?? "");
  const [caption, setCaption] = useState(media[0]?.caption ?? "");
  const [when, setWhen] = useState(`${date}T09:00`);

  function onMediaChange(id: string) {
    setMediaId(id);
    const m = media.find((x) => x.id === id);
    setCaption(m?.caption ?? "");
  }

  function submit() {
    start(async () => {
      const res = await createManualPost({
        instagramAccountId: accountId,
        mediaAssetId: mediaId,
        caption: caption.trim() ? caption : null,
        scheduledAt: new Date(when),
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Publicação agendada", "success");
      onCreated();
    });
  }

  if (media.length === 0) {
    return (
      <Modal open onClose={onClose} title="Agendar publicação">
        <p className="text-sm text-[var(--color-muted)]">
          Você ainda não tem mídias prontas. Envie imagens ou vídeos na Biblioteca primeiro.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Agendar publicação">
      <Field label="Publicar em">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Mídia">
        <Select value={mediaId} onChange={(e) => onMediaChange(e.target.value)}>
          {media.map((m) => (
            <option key={m.id} value={m.id}>
              {m.type === "VIDEO" ? "🎬" : "🖼"} {m.name}
            </option>
          ))}
        </Select>
      </Field>
      {mediaId && (
        <div className="mb-4 overflow-hidden rounded-[var(--radius)] border bg-[var(--color-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(mediaId, "preview")} alt="" className="max-h-52 w-full object-contain" />
        </div>
      )}
      <Field label="Data e hora">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-10 w-full rounded-[var(--radius)] border bg-white px-3 text-sm"
        />
      </Field>
      <Field label="Legenda" hint="Começa com a legenda padrão da mídia. Editar aqui não muda a mídia.">
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={pending || !accountId || !mediaId}>
          Agendar
        </Button>
      </div>
    </Modal>
  );
}

/** datetime-local <-> ISO respeitando um fuso fixo simples (assume input já no fuso do usuário). */
function toLocalInput(iso: string, _tz: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string, _tz: string): Date {
  return new Date(v);
}
