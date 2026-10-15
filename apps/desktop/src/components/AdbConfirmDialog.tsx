import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AdbPlanReport } from "../types";
import { IconArrowRight, IconBolt, IconFolder } from "./icons";

export type AdbChoice = "adb" | "mtp" | "cancel";

export interface AdbConfirmRequest {
  folderName: string;
  destLabel: string;
  report: AdbPlanReport;
}

const RENAME_PREVIEW = 5;

export function AdbConfirmDialog({
  request,
  onChoose,
}: {
  request: AdbConfirmRequest;
  onChoose: (choice: AdbChoice) => void;
}) {
  const { t } = useTranslation();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { report } = request;

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChoose("cancel");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoose]);

  const stats = [
    { n: report.clean.length, label: t("adb.confirm.new") },
    { n: report.skippedSame.length, label: t("adb.confirm.skipped") },
    { n: report.renamed.length, label: t("adb.confirm.renamed") },
  ];

  return (
    <div className="scrim">
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="adb-confirm-title">
        <div className="sheet-head">
          <span className="sheet-icon">
            <IconBolt size={20} />
          </span>
          <div>
            <h2 id="adb-confirm-title">{t("adb.confirm.title", { folderName: request.folderName })}</h2>
            <p>{t("adb.confirm.lead")}</p>
          </div>
        </div>

        <div className="sheet-body">
          <div className="dest">
            <span>{t("adb.confirm.dest")}</span>
            <span className="dest-chip">
              <span className="kind-folder">
                <IconFolder size={14} />
              </span>
              {request.destLabel}
            </span>
          </div>

          <div className="stats">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <span className="stat-n num">{s.n.toLocaleString()}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>

          {report.renamed.length > 0 && (
            <details className="renames" open={report.renamed.length <= RENAME_PREVIEW}>
              <summary>{t("adb.confirm.renamed_list", { count: report.renamed.length })}</summary>
              <div className="rename-list">
                {report.renamed.slice(0, RENAME_PREVIEW).map((r) => (
                  <div key={r.original} className="rename">
                    <span className="dim ellipsis">{r.original}</span>
                    <span className="faint">
                      <IconArrowRight size={14} />
                    </span>
                    <span className="strong ellipsis">{r.newName}</span>
                  </div>
                ))}
                {report.renamed.length > RENAME_PREVIEW && (
                  <span className="dim">{t("adb.confirm.more", { count: report.renamed.length - RENAME_PREVIEW })}</span>
                )}
              </div>
            </details>
          )}

          <p className="fine">{t("adb.confirm.rule")}</p>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={() => onChoose("cancel")}>
            {t("adb.confirm.cancel")}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => onChoose("mtp")} title={t("adb.confirm.mtp_tip")}>
            {t("adb.confirm.mtp")}
          </button>
          <button type="button" className="btn primary" ref={primaryRef} onClick={() => onChoose("adb")}>
            <IconBolt size={13} />
            {t("adb.confirm.adb")}
          </button>
        </div>
      </section>
    </div>
  );
}
