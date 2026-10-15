import type { TFunction } from "i18next";

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** "오늘 21:40" / "어제 18:02" / "2026. 10. 3." — relative for the last two days. */
export function formatDate(secs: number | null | undefined, lang: string, t: TFunction): string {
  if (!secs) return "—";
  const d = new Date(secs * 1000);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.getTime() >= startOfToday) return t("date.today", { time });
  if (d.getTime() >= startOfToday - 86_400_000) return t("date.yesterday", { time });
  return d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDuration(totalSecs: number, t: TFunction): string {
  const s = Math.max(1, Math.round(totalSecs));
  if (s < 60) return t("duration.seconds", { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t("duration.minutes", { n: m });
  return t("duration.hours", { h: Math.floor(m / 60), m: m % 60 });
}

export type FileKind = "folder" | "image" | "video" | "audio" | "doc" | "file";

const EXT_KIND: Record<string, FileKind> = {};
for (const e of ["jpg", "jpeg", "png", "heic", "heif", "gif", "webp", "bmp", "dng", "raw", "tif", "tiff"]) EXT_KIND[e] = "image";
for (const e of ["mp4", "mov", "mkv", "avi", "m4v", "3gp", "webm"]) EXT_KIND[e] = "video";
for (const e of ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "amr"]) EXT_KIND[e] = "audio";
for (const e of ["pdf", "doc", "docx", "txt", "md", "rtf", "csv", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers", "hwp", "hwpx"]) EXT_KIND[e] = "doc";

export function fileKind(name: string, isDir: boolean): FileKind {
  if (isDir) return "folder";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";
  return EXT_KIND[name.slice(dot + 1).toLowerCase()] ?? "file";
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
