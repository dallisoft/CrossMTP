import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AdbStatusWire, ConflictPolicy } from "../types";
import { AdbPopover, adbReadiness } from "./AdbPopover";
import { IconBolt, IconPhone, IconRefresh } from "./icons";

export type DeviceTone = "ok" | "warn" | "err" | "none";

interface Props {
  deviceName: string;
  deviceStatus: string;
  tone: DeviceTone;
  loading: boolean;
  onRefresh: () => void;
  conflictPolicy: ConflictPolicy;
  onConflictChange: (p: ConflictPolicy) => void;
  adbStatus: AdbStatusWire | null;
  adbLoading: boolean;
  adbOpen: boolean;
  onAdbToggle: (open: boolean) => void;
  onAdbRefresh: () => void;
  showDeviceControls: boolean;
}

export function Toolbar(props: Props) {
  const { t } = useTranslation();
  const popRef = useRef<HTMLDivElement>(null);
  const { adbOpen, onAdbToggle } = props;

  useEffect(() => {
    if (!adbOpen) return;
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onAdbToggle(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAdbToggle(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [adbOpen, onAdbToggle]);

  const readiness = adbReadiness(props.adbStatus);
  const chipClass =
    readiness === "ready" ? "chip-fast" : readiness === "unknown" ? "chip-neutral" : "chip-warn";
  const chipLabel = t(`adb.chip.${readiness}`);

  const policies: ConflictPolicy[] = ["rename", "skip", "overwrite"];

  return (
    <header className="toolbar">
      <div className="device">
        <span className={`device-icon tone-${props.tone}`}>
          <IconPhone size={18} />
        </span>
        <div className="device-text">
          <span className="device-name">{props.deviceName}</span>
          <span className={`device-status tone-${props.tone}`}>
            <span className="dot" aria-hidden="true" />
            {props.deviceStatus}
          </span>
        </div>
      </div>

      <span className="spacer" />

      {props.showDeviceControls && (
        <>
          <div className="adb-anchor" ref={popRef}>
            <button
              type="button"
              className={`btn ${chipClass}`}
              aria-expanded={adbOpen}
              aria-haspopup="dialog"
              onClick={() => onAdbToggle(!adbOpen)}
            >
              <IconBolt outline={readiness !== "ready"} />
              {chipLabel}
            </button>
            {adbOpen && (
              <AdbPopover status={props.adbStatus} loading={props.adbLoading} onRefresh={props.onAdbRefresh} />
            )}
          </div>

          <div className="policy">
            <span className="policy-label" id="policy-label">
              {t("conflict.policy")}
            </span>
            <div className="seg" role="group" aria-labelledby="policy-label">
              {policies.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={props.conflictPolicy === p}
                  onClick={() => props.onConflictChange(p)}
                  title={p === "overwrite" ? t("conflict.overwrite_tip") : undefined}
                >
                  {t(`conflict.${p}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className={`btn ${props.showDeviceControls ? "icon" : ""}`}
        onClick={props.onRefresh}
        disabled={props.loading}
        aria-label={t("refresh")}
        title={t("refresh")}
      >
        <span className={props.loading ? "spin" : undefined} style={{ display: "inline-flex" }}>
          <IconRefresh />
        </span>
        {!props.showDeviceControls && t("refresh")}
      </button>
    </header>
  );
}
