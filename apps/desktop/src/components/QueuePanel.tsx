import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { basename, formatBytes, formatDuration } from "../format";
import { JobStateTag, JobView, QueueGroupView } from "../types";
import { IconArrowLeft, IconArrowRight, IconBolt, IconCheck, IconChevronDown, IconTransfer, IconX } from "./icons";

interface Props {
  jobs: JobView[];
  groups: Map<number, QueueGroupView>;
  open: boolean;
  paused: boolean;
  onToggle: () => void;
  onCancel: (jobs: JobView[]) => void;
}

interface QueueRow {
  key: string;
  label: string;
  upload: boolean;
  fast: boolean;
  jobs: JobView[];
  totalFiles: number;
  stateTag: JobStateTag;
  sent: number;
  total: number;
  rate: number;
  reason?: string;
  startedAt: number;
  bulkFilesDone?: number;
  bulkTotalFiles?: number;
  bulkCurrentFile?: string;
  doneBytes?: number;
}

const TERMINAL: JobStateTag[] = ["completed", "failed", "cancelled", "skipped"];
const isTerminal = (tag: JobStateTag) => TERMINAL.includes(tag);

export function QueuePanel({ jobs, groups, open, paused, onToggle, onCancel }: Props) {
  const { t } = useTranslation();
  const [showSkipped, setShowSkipped] = useState(false);
  const rows = buildRows(jobs, groups).filter((r) => r.stateTag !== "skipped");
  const skipped = jobs.filter((j) => j.state.tag === "skipped");
  const active = jobs.filter((j) => !isTerminal(j.state.tag));

  const count = (tags: JobStateTag[]) => rows.filter((r) => tags.includes(r.stateTag)).length;
  const counts = [
    { n: count(["transferring", "validating", "cancelling"]), label: t("queue.count.active"), tone: "" },
    { n: count(["queued"]), label: paused ? t("queue.count.held") : t("queue.count.queued"), tone: paused ? "warn" : "" },
    { n: count(["failed"]), label: t("queue.count.failed"), tone: "err" },
    { n: count(["completed"]), label: t("queue.count.completed"), tone: "ok" },
  ].filter((c) => c.n > 0);

  return (
    <section className={`tray ${open ? "open" : ""}`} aria-label={t("queue.title")}>
      <div className="tray-head">
        <h2>{t("queue.title")}</h2>
        {counts.length === 0 && <span className="dim small">{t("queue.idle")}</span>}
        {counts.map((c) => (
          <span key={c.label} className={`pill ${c.tone}`}>
            {c.label} {c.n}
          </span>
        ))}
        {skipped.length > 0 && (
          <button type="button" className="btn ghost small" aria-expanded={showSkipped} onClick={() => setShowSkipped((v) => !v)}>
            {showSkipped ? t("queue.skipped_hide", { count: skipped.length }) : t("queue.skipped_show", { count: skipped.length })}
          </button>
        )}
        <span className="spacer" />
        {active.length > 0 && (
          <>
            <span className="dim small num">{t("queue.remaining_jobs", { count: active.length })}</span>
            <button type="button" className="btn small" onClick={() => onCancel(active)}>
              {t("queue.cancel_all")}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn ghost icon"
          aria-expanded={open}
          aria-label={open ? t("queue.collapse") : t("queue.expand")}
          onClick={onToggle}
        >
          <span className={`chev ${open ? "" : "closed"}`}>
            <IconChevronDown />
          </span>
        </button>
      </div>

      {open && showSkipped && skipped.length > 0 && (
        <div className="skipped-list">
          {skipped.map((j) => (
            <div key={j.id} className="skipped-item">
              <span className="ellipsis">{labelFor(j)}</span>
              <span className="dim ellipsis">{j.state.reason ?? t("queue.state.skipped")}</span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="tray-list">
          {rows.length === 0 && (
            <div className="tray-empty">
              <IconTransfer size={18} />
              {t("queue.empty")}
            </div>
          )}
          {rows.map((row) => (
            <TransferRow key={row.key} row={row} paused={paused} onCancel={onCancel} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function TransferRow({
  row,
  paused,
  onCancel,
  t,
}: {
  row: QueueRow;
  paused: boolean;
  onCancel: (jobs: JobView[]) => void;
  t: TFunction;
}) {
  // Bulk uploads report file counts; small files often skip libmtp's
  // byte-level callback, so file-count progress is the visible signal.
  const useBulk = row.bulkTotalFiles !== undefined && row.bulkTotalFiles > 0;
  const pct =
    row.stateTag === "completed"
      ? 100
      : row.total > 0
        ? Math.min(100, Math.floor((row.sent / row.total) * 100))
        : useBulk
          ? Math.min(100, Math.floor(((row.bulkFilesDone ?? 0) / (row.bulkTotalFiles ?? 1)) * 100))
          : 0;
  const filesDone = useBulk ? row.bulkFilesDone ?? 0 : row.jobs.filter((j) => j.state.tag === "completed").length;
  const filesTotal = useBulk ? row.bulkTotalFiles ?? row.totalFiles : row.totalFiles;
  const active = row.jobs.filter((j) => !isTerminal(j.state.tag));
  const transferring = row.stateTag === "transferring";
  const failed = row.stateTag === "failed";

  const route = row.upload ? t("queue.route.up") : t("queue.route.down");
  const sub = transferring && row.bulkCurrentFile ? `${route} · ${t("queue.current", { file: row.bulkCurrentFile })}` : route;

  let progressText = "";
  if (transferring || row.stateTag === "completed") {
    progressText = filesTotal > 1 ? t("queue.pct_files", { pct, done: filesDone.toLocaleString(), total: filesTotal.toLocaleString() }) : `${pct}%`;
  } else if (row.stateTag === "queued") {
    progressText = paused ? t("queue.held_note") : t("queue.waiting_note");
  } else if (row.stateTag === "validating") {
    progressText = t("queue.validating_note");
  } else if (filesTotal > 1) {
    progressText = t("queue.files_done", { done: filesDone.toLocaleString(), total: filesTotal.toLocaleString() });
  }

  let primary = t(`queue.state.${row.stateTag}`);
  let secondary = "";
  if (transferring) {
    primary = row.total > 0 ? `${formatBytes(row.sent)} / ${formatBytes(row.total)}` : `${pct}%`;
    if (row.rate > 0) {
      const eta = row.total > row.sent ? (row.total - row.sent) / row.rate : 0;
      secondary = eta > 0
        ? t("queue.rate_eta", { rate: formatBytes(row.rate), eta: formatDuration(eta, t) })
        : t("queue.rate", { rate: formatBytes(row.rate) });
    } else {
      secondary = t("queue.calculating");
    }
  } else if (row.stateTag === "completed" && row.doneBytes !== undefined) {
    secondary = formatBytes(row.doneBytes);
  } else if (row.stateTag === "queued" && paused) {
    primary = t("queue.state.held");
  }

  const showBar = ["validating", "transferring", "completed", "cancelling"].includes(row.stateTag);

  return (
    <div className={`job state-${row.stateTag}`}>
      <span className={`dir ${row.upload ? "up" : "down"}`}>
        {row.upload ? <IconArrowRight label={t("queue.route.up")} /> : <IconArrowLeft label={t("queue.route.down")} />}
      </span>
      <div className="job-main">
        <div className="job-name-line">
          <span className="job-name" title={row.label}>
            {row.label}
          </span>
          {row.fast ? (
            <span className="badge fast">
              <IconBolt size={10} />
              {t("queue.badge.adb")}
            </span>
          ) : (
            <span className="badge">MTP</span>
          )}
        </div>
        <span className="job-sub" title={sub}>
          {sub}
        </span>
        {failed && row.reason && <span className="job-reason selectable">{row.reason}</span>}
      </div>
      <div className="job-progress">
        {showBar && (
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={row.label}
          >
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
        <span className="small dim num ellipsis">{progressText}</span>
      </div>
      <div className="job-figures">
        <span className={`num job-primary state-${row.stateTag}`}>{primary}</span>
        {secondary && <span className="small dim num">{secondary}</span>}
      </div>
      <div className="job-action">
        {active.length > 0 ? (
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => onCancel(active)}
            disabled={row.stateTag === "cancelling"}
            aria-label={t("queue.cancel_one", { name: row.label })}
            title={t("queue.cancel")}
          >
            <IconX size={15} />
          </button>
        ) : row.stateTag === "completed" ? (
          <span className="ok-fg">
            <IconCheck size={18} label={t("queue.state.completed")} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function buildRows(jobs: JobView[], groups: Map<number, QueueGroupView>): QueueRow[] {
  const buckets = new Map<string, { group?: QueueGroupView; jobs: JobView[] }>();
  for (const job of jobs) {
    const group = groups.get(job.id);
    const key = group?.id ?? `job-${job.id}`;
    const bucket = buckets.get(key) ?? { group, jobs: [] };
    bucket.jobs.push(job);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => makeRow(key, b.jobs, b.group))
    .sort((a, b) => b.startedAt - a.startedAt);
}

function makeRow(key: string, jobs: JobView[], group?: QueueGroupView): QueueRow {
  const first = jobs[0];
  const bulk = jobs.find((j) => j.kind.kind === "bulkUpload");
  const fast = first.kind.kind === "adbTarUpload";
  const totalFiles = group?.totalFiles ?? bulk?.totalFiles ?? jobs.length;
  const stateTag = deriveState(jobs);
  const completedBytes = jobs.reduce((sum, j) => sum + (j.state.tag === "completed" ? j.state.bytes ?? 0 : 0), 0);
  return {
    key,
    label: group?.label ?? labelFor(first),
    upload: first.kind.kind !== "download",
    fast,
    jobs,
    totalFiles,
    stateTag,
    sent: jobs.reduce((s, j) => s + j.sent, 0),
    total: jobs.reduce((s, j) => s + j.total, 0),
    rate: jobs.reduce((s, j) => s + (j.state.tag === "transferring" ? j.rate ?? 0 : 0), 0),
    reason: jobs.find((j) => j.state.tag === "failed" && j.state.reason)?.state.reason,
    startedAt: Math.max(...jobs.map((j) => j.startedAt)),
    bulkFilesDone: bulk?.filesDone ?? (fast ? first.filesDone : undefined),
    bulkTotalFiles: bulk?.totalFiles ?? (fast ? first.totalFiles : undefined),
    bulkCurrentFile: bulk?.currentFile ?? (fast ? first.currentFile : undefined),
    doneBytes: completedBytes > 0 ? completedBytes : undefined,
  };
}

function labelFor(job: JobView): string {
  switch (job.kind.kind) {
    case "download":
    case "upload":
    case "bulkUpload":
      return job.kind.name;
    case "adbTarUpload":
      // Destination basename so concurrent ADB uploads stay distinguishable.
      return basename(job.kind.destPath);
  }
}

function deriveState(jobs: JobView[]): JobStateTag {
  const tags = jobs.map((j) => j.state.tag);
  if (tags.includes("transferring")) return "transferring";
  if (tags.includes("cancelling")) return "cancelling";
  if (tags.includes("validating")) return "validating";
  if (tags.includes("queued")) return "queued";
  if (tags.includes("failed")) return "failed";
  if (tags.every((tag) => tag === "cancelled")) return "cancelled";
  if (tags.every((tag) => tag === "skipped")) return "skipped";
  if (tags.every((tag) => tag === "cancelled" || tag === "skipped")) return "cancelled";
  return "completed";
}
