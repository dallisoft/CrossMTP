// ADB 고속 업로드 상태 팝오버.
//
// 폴더 업로드 라우팅은 App.tsx `routeFoldersViaAdb`가 전부 처리하므로
// 이 팝오버는 *정보 표시*만 담당합니다 (plan.md §2.1):
//   1. 지금 고속 경로를 쓸 수 있는지, 아니면 MTP로 보내는지
//   2. 쓸 수 없다면 어떤 조건이 빠졌는지
//   3. 고속 경로가 적용되는 조건
//
// `adb_status`는 adb shell 프로브를 돌리므로 열 때/다시 확인할 때만
// 호출합니다 (폴링 금지).

import { useTranslation } from "react-i18next";
import { AdbStatusWire } from "../types";
import { IconBolt, IconCheck, IconExclaim, IconRefresh } from "./icons";

export type AdbReadiness = "unknown" | "ready" | "no_adb" | "no_device" | "unauthorized" | "incapable" | "too_many";

export function adbReadiness(status: AdbStatusWire | null): AdbReadiness {
  if (!status) return "unknown";
  if (!status.adbAvailable) return "no_adb";
  if (status.devices.length === 0) return "no_device";
  const ready = status.devices.filter((d) => d.state === "device" && d.canTarUpload && d.tarExtractSmokeOk);
  if (ready.length === 1) return "ready";
  if (ready.length > 1) return "too_many";
  if (status.devices.some((d) => d.state === "device")) return "incapable";
  return "unauthorized";
}

type CheckState = "ok" | "warn" | "pending";

interface Check {
  state: CheckState;
  title: string;
  detail?: string;
  mono?: boolean;
}

export function AdbPopover({
  status,
  loading,
  onRefresh,
}: {
  status: AdbStatusWire | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const readiness = adbReadiness(status);
  const authorized = status?.devices.filter((d) => d.state === "device") ?? [];
  const capable = authorized.filter((d) => d.canTarUpload && d.tarExtractSmokeOk);

  const checks: Check[] = [];
  if (status) {
    checks.push(
      status.adbAvailable
        ? { state: "ok", title: t("adb.check.adb_ok"), detail: status.adbPath ?? undefined, mono: true }
        : { state: "warn", title: t("adb.check.adb_missing"), detail: t("adb.check.adb_missing_detail") },
    );
    if (status.adbAvailable) {
      const count = status.devices.length;
      checks.push(
        count === 1
          ? { state: "ok", title: t("adb.check.one_device") }
          : count === 0
            ? { state: "warn", title: t("adb.check.no_device"), detail: t("adb.check.no_device_detail") }
            : { state: "warn", title: t("adb.check.many_devices", { count }), detail: t("adb.check.many_devices_detail") },
      );
      if (count > 0) {
        checks.push(
          authorized.length > 0
            ? { state: "ok", title: t("adb.check.authorized") }
            : { state: "warn", title: t("adb.check.unauthorized"), detail: t("adb.check.unauthorized_detail") },
        );
        checks.push(
          authorized.length === 0
            ? { state: "pending", title: t("adb.check.tar"), detail: t("adb.check.tar_pending") }
            : capable.length > 0
              ? { state: "ok", title: t("adb.check.tar_ok") }
              : { state: "warn", title: t("adb.check.tar_fail"), detail: t("adb.check.tar_fail_detail") },
        );
      }
    }
  }

  return (
    <section className="popover" role="dialog" aria-labelledby="adb-pop-title">
      <div className="pop-head">
        <h2 id="adb-pop-title">
          <span className="fast-fg">
            <IconBolt size={16} />
          </span>
          {t("adb.pop.title")}
        </h2>
        <p>{t("adb.pop.desc")}</p>
      </div>

      {readiness === "unknown" ? (
        <div className="callout neutral">{loading ? t("adb.pop.checking") : t("adb.pop.not_checked")}</div>
      ) : readiness === "ready" ? (
        <div className="callout ok" role="status">
          <strong>{t("adb.pop.ready_title")}</strong>
          <span>{t("adb.pop.ready_desc")}</span>
        </div>
      ) : (
        <div className="callout warn" role="status">
          <strong>{t("adb.pop.fallback_title")}</strong>
          <span>{t(`adb.pop.reason.${readiness}`)}</span>
        </div>
      )}

      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.title}>
              <span className={`mark mark-${c.state}`}>
                {c.state === "ok" && <IconCheck size={13} label={t("adb.check.done")} />}
                {c.state === "warn" && <IconExclaim size={13} label={t("adb.check.needed")} />}
              </span>
              <div>
                <span className={`check-title ${c.state === "pending" ? "dim" : ""}`}>{c.title}</span>
                {c.detail && <span className={`check-detail ${c.mono ? "mono" : ""}`}>{c.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pop-section">
        <span className="pop-section-title">{t("adb.pop.when")}</span>
        <ul>
          <li>{t("adb.pop.when_folder")}</li>
          <li>{t("adb.pop.when_internal")}</li>
          <li>{t("adb.pop.when_fallback")}</li>
        </ul>
      </div>

      <p className="pop-note">{t("adb.pop.security")}</p>

      <div className="pop-foot">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onRefresh} disabled={loading}>
          <span className={loading ? "spin" : undefined} style={{ display: "inline-flex" }}>
            <IconRefresh size={14} />
          </span>
          {loading ? t("adb.pop.checking_short") : t("adb.pop.recheck")}
        </button>
      </div>
    </section>
  );
}
