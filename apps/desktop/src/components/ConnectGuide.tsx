import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconExclaim, IconLaptop, IconPhone, IconPhoneOff, IconRefresh } from "./icons";

const KILL_COMMAND = 'killall "Android File Transfer" "Android File Transfer Agent" icdd';

interface Props {
  /** Device enumerated but storage unreadable → lock / USB mode is the likely cause. */
  storageBlocked: boolean;
  lastError: string | null;
  envHints: string[];
  loading: boolean;
  onRefresh: () => void;
}

/** Shown in the device pane while no usable device is connected. */
export function ConnectGuide({ storageBlocked, lastError, envHints, loading, onRefresh }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const daemonBusy = envHints.length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(KILL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const steps = [
    { title: t("guide.step1.title"), detail: t("guide.step1.detail"), warn: false },
    { title: t("guide.step2.title"), detail: t("guide.step2.detail"), warn: storageBlocked },
    { title: t("guide.step3.title"), detail: t("guide.step3.detail"), warn: storageBlocked },
  ];

  return (
    <div className="guide">
      <div className="guide-inner">
        <div className="guide-art" aria-hidden="true">
          <IconLaptop size={40} />
          <span className="guide-cable" />
          <IconPhone size={36} />
        </div>
        <h2 className="guide-title">{storageBlocked ? t("guide.blocked_title") : t("guide.title")}</h2>
        <p className="guide-lead">{storageBlocked ? t("guide.blocked_lead") : t("guide.lead")}</p>

        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.title} className="step">
              <span className={`step-num ${s.warn ? "warn" : ""}`}>
                {s.warn ? <IconExclaim size={14} label={t("adb.check.needed")} /> : i + 1}
              </span>
              <div>
                <span className="step-title">{s.title}</span>
                <span className="step-detail">{s.detail}</span>
              </div>
            </li>
          ))}
          <li className="step">
            <span className={`step-num ${daemonBusy ? "warn" : ""}`}>
              {daemonBusy ? <IconExclaim size={14} label={t("adb.check.needed")} /> : 4}
            </span>
            <div>
              <span className="step-title">{t("guide.step4.title")}</span>
              <span className="step-detail">{t("guide.step4.detail")}</span>
              {daemonBusy && (
                <div className="callout warn compact" role="status">
                  {envHints.map((h) => (
                    <span key={h}>{h.split(". ")[0]}</span>
                  ))}
                  <code className="selectable">{KILL_COMMAND}</code>
                  <div>
                    <button type="button" className="btn small" onClick={copy}>
                      {copied ? t("guide.copied") : t("guide.copy")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </li>
        </ol>

        {lastError && (
          <p className="guide-error">
            {t("guide.last_error")} <span className="selectable">{lastError}</span>
          </p>
        )}

        <div className="guide-actions">
          <button type="button" className="btn primary" onClick={onRefresh} disabled={loading}>
            <span className={loading ? "spin" : undefined} style={{ display: "inline-flex" }}>
              <IconRefresh size={15} />
            </span>
            {loading ? t("guide.searching") : t("refresh")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Device pane body while the queue is paused because the session died. */
export function DisconnectedPlaceholder({ lastPath }: { lastPath: string }) {
  const { t } = useTranslation();
  return (
    <div className="pane-placeholder">
      <span className="faint">
        <IconPhoneOff size={40} />
      </span>
      <strong>{t("disconnected.pane_title")}</strong>
      <span className="dim">{t("disconnected.pane_desc", { path: lastPath })}</span>
    </div>
  );
}
