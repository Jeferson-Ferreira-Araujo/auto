import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { InstagramInsightsService } from "@/lib/instagram/insights";
import { resolveRange } from "@/lib/insights/range";
import {
  deltaTone,
  formatDelta,
  formatNumber,
  formatShortDate,
  mediaKindLabel,
  type BestMedia,
} from "@/lib/insights/report";
import { MiniBars } from "./MiniBars";
import { RangeTabs } from "./RangeTabs";

function DeltaChip({ pct }: { pct: number | null }) {
  const tone = deltaTone(pct);
  const cls =
    tone === "up"
      ? "bg-green-100 text-green-700"
      : tone === "down"
        ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-500";
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{formatDelta(pct)}</span>;
}

function BestCard({ title, media }: { title: string; media: BestMedia }) {
  return (
    <Card>
      <CardBody className="flex gap-3">
        {media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.thumbnailUrl} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-black/5 text-2xl">
            {media.mediaProductType === "REELS" ? "🎬" : "🖼️"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[var(--color-muted)]">{title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
            <Badge tone="primary">{mediaKindLabel(media)}</Badge>
            <span className="text-[var(--color-muted)]">{formatShortDate(media.publishedAt)}</span>
            {media.categoryName && <span className="text-[var(--color-muted)]">· {media.categoryName}</span>}
          </div>
          <div className="mt-1 text-sm">
            <strong>{formatNumber(media.views || media.reach)}</strong> visualizações ·{" "}
            {formatNumber(media.likes)} curtidas · {formatNumber(media.comments)} comentários
          </div>
          {media.permalink && (
            <a
              href={media.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-medium text-[var(--color-primary)]"
            >
              Ver no Instagram →
            </a>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export async function PerformanceView({
  org,
  sp,
}: {
  org: { id: string; name: string };
  sp: { range?: string; from?: string; to?: string };
}) {
  const range = resolveRange(sp);
  const report = await InstagramInsightsService.getReport(org.id, range);

  const header = (
    <>
      <PageHeader title="Desempenho" description={`Como o seu conteúdo foi nos ${range.label}`} />
      <Suspense fallback={null}>
        <RangeTabs />
      </Suspense>
    </>
  );

  if (report.status === "not_connected") {
    return (
      <>
        {header}
        <div className="mt-6">
          <EmptyState
            icon="📊"
            title="Ative os relatórios de desempenho"
            description="Reconecte seu Instagram uma vez para autorizar o acesso às métricas. É rápido e não interrompe suas publicações."
            action={
              <Link href="/instagram" className="text-sm font-medium text-[var(--color-primary)]">
                Reconectar Instagram
              </Link>
            }
          />
        </div>
      </>
    );
  }

  if (report.status === "no_data") {
    return (
      <>
        {header}
        <div className="mt-6">
          <EmptyState
            icon="🗓️"
            title="Nenhuma publicação neste período"
            description="Quando você publicar pela AUTOMIDIA, os números aparecem aqui."
          />
        </div>
      </>
    );
  }

  const m = Object.fromEntries(report.metrics.map((x) => [x.key, x]));
  const resumoViews = m.views?.value ?? 0;

  return (
    <>
      {header}

      <div className="mt-6 space-y-6">
        {/* Resumo em frase */}
        <Card>
          <CardBody>
            <p className="text-sm leading-relaxed">
              Nos <strong>{range.label}</strong>:{" "}
              <strong>{formatNumber(report.posts)} publicações</strong> ·{" "}
              <strong>{formatNumber(resumoViews)} visualizações</strong>
              {report.followers != null && (
                <>
                  {" "}
                  · <strong>{report.followers >= 0 ? "+" : ""}{formatNumber(report.followers)} seguidores</strong>
                </>
              )}
              .
              {report.best && (
                <>
                  {" "}
                  Seu conteúdo com melhor desempenho foi{" "}
                  {report.best.permalink ? (
                    <a
                      href={report.best.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--color-primary)]"
                    >
                      este {mediaKindLabel(report.best).toLowerCase()}
                    </a>
                  ) : (
                    <strong>este {mediaKindLabel(report.best).toLowerCase()}</strong>
                  )}
                  .
                </>
              )}
            </p>
          </CardBody>
        </Card>

        {/* Tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {report.metrics.map((x) => (
            <Card key={x.key}>
              <CardBody>
                <div className="flex items-start justify-between gap-1">
                  <div className="text-2xl font-bold">
                    {x.key === "followers" && !report.followersComparable
                      ? "—"
                      : `${x.key === "followers" && x.value >= 0 ? "+" : ""}${formatNumber(x.value)}`}
                  </div>
                  {x.deltaPct != null && <DeltaChip pct={x.deltaPct} />}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">{x.label}</div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Melhor publicação */}
        {report.best && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">MELHOR PUBLICAÇÃO</h2>
            <BestCard title="Mais visualizada no período" media={report.best} />
          </div>
        )}

        {/* Destaques */}
        {(report.bestReel || report.bestImage || report.bestCategory) && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">DESTAQUES</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {report.bestReel && <BestCard title="Melhor Reel" media={report.bestReel} />}
              {report.bestImage && <BestCard title="Melhor imagem" media={report.bestImage} />}
              {report.bestCategory && (
                <Card>
                  <CardBody>
                    <div className="text-xs font-semibold text-[var(--color-muted)]">
                      Categoria que mais performou
                    </div>
                    <div className="mt-1 text-lg font-bold">{report.bestCategory.name}</div>
                    <div className="text-sm text-[var(--color-muted)]">
                      {formatNumber(report.bestCategory.avgViews)} visualizações em média ·{" "}
                      {report.bestCategory.posts} publicações
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Frases de comparação */}
        {report.sentences.length > 0 && (
          <Card>
            <CardBody>
              <ul className="space-y-1.5 text-sm">
                {report.sentences.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--color-primary)]">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {/* Gráfico */}
        {report.reachSeries.some((d) => d.reach > 0) && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">ALCANCE POR DIA</h2>
            <Card>
              <CardBody>
                <MiniBars data={report.reachSeries} />
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
