import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  AdbPlanReport,
  AdbStatusWire,
  ConflictPolicy,
  DeviceSnapshot,
  Entry,
  JobView,
  LocalEntry,
  QueueGroupView,
  Storage,
  TransferEvent,
} from "./types";
import { basename, formatBytes } from "./format";
import { AdbChoice, AdbConfirmDialog, AdbConfirmRequest } from "./components/AdbConfirmDialog";
import { adbReadiness } from "./components/AdbPopover";
import { ConnectGuide, DisconnectedPlaceholder } from "./components/ConnectGuide";
import { Crumb, DropHint, FilePane, PaneItem } from "./components/FilePane";
import { QueuePanel } from "./components/QueuePanel";
import { DeviceTone, Toolbar } from "./components/Toolbar";
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconFolder,
  IconLaptop,
  IconPhone,
  IconRefresh,
} from "./components/icons";

interface BreadcrumbNode {
  id: number; // PARENT_ROOT (0xFFFFFFFF) for the storage root
  name: string;
}

const PARENT_ROOT = 0xffffffff;

interface InternalDrag {
  from: "local" | "device";
  keys: string[];
  label: string;
  hasFolder: boolean;
  x: number;
  y: number;
}

type ConfirmFn = (req: AdbConfirmRequest) => Promise<AdbChoice>;

export function App() {
  const { t } = useTranslation();

  // ---- device side ----
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStorage, setActiveStorage] = useState<Storage | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbNode[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [deviceSel, setDeviceSel] = useState<Set<string>>(new Set());

  // ---- local side ----
  const [homeDir, setHomeDir] = useState<string>("");
  const [localPath, setLocalPath] = useState<string>("");
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSel, setLocalSel] = useState<Set<string>>(new Set());

  // ---- queue / session ----
  const [jobs, setJobs] = useState<Map<number, JobView>>(new Map());
  const [jobGroups, setJobGroups] = useState<Map<number, QueueGroupView>>(new Map());
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("rename");
  const [trayOpen, setTrayOpen] = useState(true);
  /** Reason string while the orchestrator queue is paused by a dead session. */
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  /** Device is back but the queue still holds paused jobs → ask resume/clear. */
  const [resumePending, setResumePending] = useState(false);
  const [envHints, setEnvHints] = useState<string[]>([]);

  // ---- ADB ----
  const [adbStatus, setAdbStatus] = useState<AdbStatusWire | null>(null);
  const [adbLoading, setAdbLoading] = useState(false);
  const [adbOpen, setAdbOpen] = useState(false);
  const [adbConfirm, setAdbConfirm] = useState<
    { request: AdbConfirmRequest; resolve: (c: AdbChoice) => void } | null
  >(null);

  // ---- drag ----
  const [internalDrag, setInternalDrag] = useState<InternalDrag | null>(null);
  const internalDragRef = useRef<InternalDrag | null>(null);
  internalDragRef.current = internalDrag;
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const localPaneRef = useRef<HTMLElement>(null);
  const devicePaneRef = useRef<HTMLElement>(null);

  // Latest values for once-subscribed listeners.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const activeStorageRef = useRef(activeStorage);
  activeStorageRef.current = activeStorage;
  const breadcrumbRef = useRef(breadcrumb);
  breadcrumbRef.current = breadcrumb;
  const localPathRef = useRef(localPath);
  localPathRef.current = localPath;
  const uploadFilesRef = useRef<(paths: string[]) => void>(() => {});
  const canUploadRef = useRef(false);

  const connected = !!(snapshot && snapshot.devices.length > 0 && snapshot.storages.length > 0);
  const deviceUsable = connected && !pausedReason;
  canUploadRef.current = deviceUsable;

  const loadEntries = useCallback(async (storageId: number, parentId: number) => {
    try {
      const list = await invoke<Entry[]>("list_entries", { storageId, parentId });
      setEntries(list);
      setBrowserError(null);
    } catch (err) {
      setEntries([]);
      setBrowserError(errText(err));
    }
  }, []);

  const loadLocalEntries = useCallback(async (path: string) => {
    try {
      const list = await invoke<LocalEntry[]>("list_local_entries", { path });
      setLocalEntries(list);
      setLocalPath(path);
      setLocalError(null);
      setLocalSel(new Set());
    } catch (err) {
      setLocalError(errText(err));
    }
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      setBrowserError(null);
      try {
        const snap = await invoke<DeviceSnapshot>("device_snapshot", { force });
        setSnapshot(snap);
        const usable = snap.devices.length > 0 && snap.storages.length > 0;
        if (usable) {
          setPausedReason(null);
          setResumePending(await invoke<boolean>("get_queue_state"));
        }
        const firstStorage = snap.storages[0] ?? null;
        setActiveStorage(firstStorage);
        setDeviceSel(new Set());
        if (firstStorage) {
          setBreadcrumb([{ id: PARENT_ROOT, name: firstStorage.description || t("device.storage") }]);
          await loadEntries(firstStorage.id, PARENT_ROOT);
        } else {
          setBreadcrumb([]);
          setEntries([]);
        }
      } catch (err) {
        setSnapshot({ devices: [], storages: [], error: errText(err), permissionHint: true });
        setEntries([]);
        setBreadcrumb([]);
      } finally {
        setLoading(false);
      }
      invoke<{ libmtpLoaded: boolean; hints: string[] }>("environment_check")
        .then((r) => setEnvHints(r.hints))
        .catch(() => {});
    },
    [loadEntries, t],
  );

  const refreshAdb = useCallback(async () => {
    setAdbLoading(true);
    try {
      setAdbStatus(await invoke<AdbStatusWire>("adb_status"));
    } catch (e) {
      setAdbStatus({ adbAvailable: false, adbPath: null, adbSource: null, error: errText(e), devices: [] });
    } finally {
      setAdbLoading(false);
    }
  }, []);

  const toggleAdb = useCallback(
    (open: boolean) => {
      setAdbOpen(open);
      if (open && !adbStatus && !adbLoading) refreshAdb();
    },
    [adbStatus, adbLoading, refreshAdb],
  );

  const refreshAfterTransfer = useCallback(
    (job: JobView | undefined) => {
      if (!job) return;
      window.setTimeout(() => {
        if (job.kind.kind === "download") {
          const path = localPathRef.current;
          if (path) loadLocalEntries(path);
        } else {
          const storage = activeStorageRef.current;
          const crumb = breadcrumbRef.current;
          const parent = crumb[crumb.length - 1]?.id ?? PARENT_ROOT;
          if (storage) loadEntries(storage.id, parent);
        }
      }, 250);
    },
    [loadEntries, loadLocalEntries],
  );

  // Mount: transfer events, native drag-drop, language menu, initial load.
  useEffect(() => {
    const unlistenTransfer = listen<TransferEvent>("transfer-event", (e) => {
      if (e.payload.type === "queuePaused") {
        setPausedReason(e.payload.reason);
        return;
      }
      if (
        e.payload.type === "stateChanged" &&
        ["completed", "failed", "cancelled", "skipped"].includes(e.payload.state.tag)
      ) {
        refreshAfterTransfer(jobsRef.current.get(e.payload.id));
      }
      setJobs((prev) => applyEvent(prev, e.payload));
    });

    // Tauri reports drag positions in physical pixels; DOM rects are CSS px.
    const toCss = (p: { x: number; y: number }) => ({
      x: p.x / window.devicePixelRatio,
      y: p.y / window.devicePixelRatio,
    });
    const unlistenDrop = getCurrentWebview().onDragDropEvent((e) => {
      const ev = e.payload;
      if (ev.type === "leave") {
        setNativeDragOver(false);
        return;
      }
      const over = canUploadRef.current && pointInElement(toCss(ev.position), devicePaneRef.current);
      if (ev.type === "drop") {
        setNativeDragOver(false);
        if (over && ev.paths.length > 0) uploadFilesRef.current(ev.paths);
        return;
      }
      setNativeDragOver(over);
    });

    invoke<string>("default_dest_dir")
      .then((dir) => {
        if (/[\\/]Downloads[\\/]?$/.test(dir)) setHomeDir(dir.replace(/[\\/]Downloads[\\/]?$/, ""));
        loadLocalEntries(dir);
      })
      .catch(() => {});
    refresh();

    const unlistenLang = listen<string>("language-changed", (e) => {
      i18next.changeLanguage(e.payload);
    });

    return () => {
      unlistenTransfer.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
      unlistenLang.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- navigation ----
  const enterDeviceFolder = useCallback(
    async (entry: Entry) => {
      if (entry.kind !== "folder" || !activeStorage) return;
      setBreadcrumb((b) => [...b, { id: entry.itemId, name: entry.name }]);
      setDeviceSel(new Set());
      await loadEntries(activeStorage.id, entry.itemId);
    },
    [activeStorage, loadEntries],
  );

  const goToCrumb = useCallback(
    async (idx: number) => {
      if (!activeStorage) return;
      const next = breadcrumb.slice(0, idx + 1);
      setBreadcrumb(next);
      setDeviceSel(new Set());
      await loadEntries(activeStorage.id, next[next.length - 1].id);
    },
    [activeStorage, breadcrumb, loadEntries],
  );

  // ---- transfers ----
  const confirmAdb: ConfirmFn = useCallback(
    (request) => new Promise<AdbChoice>((resolve) => setAdbConfirm({ request, resolve })),
    [],
  );

  const downloadEntries = useCallback(
    async (list: Entry[]) => {
      if (!localPath || !activeStorage) {
        setBrowserError(t("app.error.local_missing"));
        return;
      }
      const failures: string[] = [];
      for (const entry of list) {
        try {
          const ids = await invoke<number[]>("enqueue_download", {
            storageId: activeStorage.id,
            fileId: entry.itemId,
            name: entry.name,
            isDir: entry.kind === "folder",
            destDir: localPath,
            expectedSize: entry.size,
            modifiedSecs: entry.modifiedSecs ?? null,
            conflict: conflictPolicy,
          });
          rememberGroup(ids, entry.name, entry.kind === "folder", setJobGroups);
        } catch (err) {
          failures.push(`${entry.name}: ${errText(err)}`);
        }
      }
      setBrowserError(failures.length > 0 ? `${t("app.error.download")}\n${failures.join("\n")}` : null);
      setTrayOpen(true);
    },
    [activeStorage, localPath, conflictPolicy, t],
  );

  const uploadFiles = useCallback(
    async (paths: string[]) => {
      if (!activeStorage) {
        setBrowserError(t("app.error.no_storage"));
        return;
      }
      const parent = breadcrumb[breadcrumb.length - 1]?.id ?? PARENT_ROOT;
      const failures: string[] = [];
      setTrayOpen(true);

      // Auto-routing: directories on internal storage may qualify for the
      // ADB tar fast path. Files always stay on MTP.
      const adbEligible: string[] = [];
      const mtpForced: string[] = [];
      for (const p of paths) {
        try {
          const st = await invoke<{ isDir: boolean; exists: boolean }>("local_stat", { path: p });
          if (st.exists && st.isDir) adbEligible.push(p);
          else mtpForced.push(p);
        } catch {
          mtpForced.push(p);
        }
      }

      const adbHandled = new Set<string>();
      if (adbEligible.length > 0) {
        try {
          const route = await routeFoldersViaAdb(adbEligible, activeStorage, breadcrumb, setJobGroups, confirmAdb, t);
          if (route.status) setAdbStatus(route.status);
          for (const p of route.handled) adbHandled.add(p);
          for (const msg of route.errors) failures.push(msg);
        } catch (e) {
          // Never let an ADB-routing throw kill the React tree — surface it
          // and fall back to MTP for everything.
          failures.push(`${t("app.error.adb_routing")}${errText(e)}`);
        }
      }

      const mtpPaths = [...mtpForced, ...adbEligible.filter((p) => !adbHandled.has(p))];
      for (const path of mtpPaths) {
        try {
          const ids = await invoke<number[]>("enqueue_upload", {
            storageId: activeStorage.id,
            parentId: parent,
            source: path,
            conflict: conflictPolicy,
          });
          rememberGroup(ids, basename(path), ids.length > 1, setJobGroups);
        } catch (err) {
          failures.push(errText(err));
        }
      }
      setBrowserError(failures.length > 0 ? failures.join("\n") : null);
    },
    [activeStorage, breadcrumb, conflictPolicy, confirmAdb, t],
  );
  uploadFilesRef.current = uploadFiles;

  const sendLocalSelection = useCallback(
    (keys: string[]) => {
      if (keys.length > 0 && deviceUsable) uploadFiles(keys);
    },
    [deviceUsable, uploadFiles],
  );

  const fetchDeviceSelection = useCallback(
    (keys: string[]) => {
      const picked = entries.filter((e) => keys.includes(String(e.itemId)));
      if (picked.length > 0) downloadEntries(picked);
    },
    [entries, downloadEntries],
  );

  const cancelJobs = useCallback((list: JobView[]) => {
    for (const job of list) {
      // ADB tar jobs live on a per-serial orchestrator with its own id space.
      if (job.kind.kind === "adbTarUpload") {
        invoke("adb_cancel_job", { serial: job.kind.serial, jobId: job.id }).catch(() => {});
      } else {
        invoke("cancel_job", { jobId: job.id }).catch(() => {});
      }
    }
  }, []);

  const resumeQueue = useCallback(async () => {
    await invoke("resume_queue").catch(() => {});
    setResumePending(false);
  }, []);

  const clearQueue = useCallback(async () => {
    await invoke("clear_queue").catch(() => {});
    setJobs(new Map());
    setJobGroups(new Map());
    setResumePending(false);
  }, []);

  // ---- internal drag (pane → pane) ----
  const startDrag = useCallback(
    (from: "local" | "device", keys: string[], point: { x: number; y: number }) => {
      const names =
        from === "local"
          ? localEntries.filter((e) => keys.includes(e.path))
          : entries.filter((e) => keys.includes(String(e.itemId)));
      if (names.length === 0) return;
      const hasFolder =
        from === "local"
          ? (names as LocalEntry[]).some((e) => e.isDir)
          : (names as Entry[]).some((e) => e.kind === "folder");
      setInternalDrag({ from, keys, label: names[0].name, hasFolder, ...point });
    },
    [localEntries, entries],
  );

  useEffect(() => {
    if (!internalDrag) return;
    const onMove = (e: PointerEvent) => {
      setInternalDrag((cur) => cur && { ...cur, x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      const cur = internalDragRef.current;
      setInternalDrag(null);
      if (!cur) return;
      const point = { x: e.clientX, y: e.clientY };
      if (cur.from === "local" && pointInElement(point, devicePaneRef.current)) sendLocalSelection(cur.keys);
      if (cur.from === "device" && pointInElement(point, localPaneRef.current)) fetchDeviceSelection(cur.keys);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInternalDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [internalDrag !== null, sendLocalSelection, fetchDeviceSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- derived view data ----
  const device = snapshot?.devices[0];
  const deviceName = connected
    ? `${device?.manufacturer ?? ""} ${device?.model ?? ""}`.trim() || device?.friendlyName || t("device.connected")
    : snapshot && snapshot.devices.length > 0
      ? `${device?.manufacturer ?? ""} ${device?.model ?? ""}`.trim() || t("device.found")
      : t("device.none");
  let tone: DeviceTone = "none";
  let deviceStatus = t("device.status.none");
  if (pausedReason) {
    tone = "err";
    deviceStatus = t("device.status.lost");
  } else if (connected) {
    tone = "ok";
    deviceStatus = t("device.status.connected");
  } else if (snapshot && snapshot.devices.length > 0) {
    tone = "warn";
    deviceStatus = t("device.status.blocked");
  }

  const localItems: PaneItem[] = useMemo(
    () =>
      localEntries.map((e) => ({
        key: e.path,
        name: e.name,
        isDir: e.isDir,
        size: e.size,
        modifiedSecs: e.modified || null,
      })),
    [localEntries],
  );
  const deviceItems: PaneItem[] = useMemo(
    () =>
      entries.map((e) => ({
        key: String(e.itemId),
        name: e.name,
        isDir: e.kind === "folder",
        size: e.size,
        modifiedSecs: e.modifiedSecs ?? null,
      })),
    [entries],
  );

  const localCrumbs: Crumb[] = useMemo(
    () => buildLocalCrumbs(localPath, homeDir).map((c) => ({ label: c.label, onClick: () => loadLocalEntries(c.path) })),
    [localPath, homeDir, loadLocalEntries],
  );
  const localParent = parentPath(localPath);
  const deviceCrumbs: Crumb[] = breadcrumb.map((c, i) => ({ label: c.name, onClick: () => goToCrumb(i) }));
  const devicePathLabel = breadcrumb.map((c) => c.name).join(" › ");
  const localPathLabel = localCrumbs.map((c) => c.label).join(" › ");

  const adbReady = adbReadiness(adbStatus) === "ready";
  const overDevice = internalDrag?.from === "local" && pointInElement(internalDrag, devicePaneRef.current);
  const overLocal = internalDrag?.from === "device" && pointInElement(internalDrag, localPaneRef.current);
  const deviceDrop: DropHint | null =
    deviceUsable && (overDevice || nativeDragOver)
      ? {
          path: devicePathLabel,
          fast: !!(overDevice && internalDrag?.hasFolder && adbReady),
          policy: t(`drop.policy.up.${conflictPolicy}`),
        }
      : null;
  const localDrop: DropHint | null = overLocal
    ? { path: localPathLabel, fast: false, policy: t(`drop.policy.down.${conflictPolicy}`) }
    : null;

  const sortedJobs = useMemo(() => [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt), [jobs]);

  const storageMeter = activeStorage && activeStorage.maxBytes > 0 && (
    <div className="meter">
      <span className="num">
        {t("storage.free", { free: formatBytes(activeStorage.freeBytes), total: formatBytes(activeStorage.maxBytes) })}
      </span>
      <div
        className="meter-track"
        role="img"
        aria-label={t("storage.used_pct", {
          pct: Math.round((1 - activeStorage.freeBytes / activeStorage.maxBytes) * 100),
        })}
      >
        <div style={{ width: `${(1 - activeStorage.freeBytes / activeStorage.maxBytes) * 100}%` }} />
      </div>
    </div>
  );

  let devicePlaceholder = null;
  if (!connected) {
    devicePlaceholder = (
      <ConnectGuide
        storageBlocked={!!snapshot && snapshot.devices.length > 0}
        lastError={snapshot?.error ?? null}
        envHints={envHints}
        loading={loading}
        onRefresh={() => refresh(true)}
      />
    );
  } else if (pausedReason) {
    devicePlaceholder = <DisconnectedPlaceholder lastPath={devicePathLabel} />;
  }

  return (
    <div className="app">
      <Toolbar
        deviceName={deviceName}
        deviceStatus={deviceStatus}
        tone={tone}
        loading={loading}
        onRefresh={() => refresh(true)}
        conflictPolicy={conflictPolicy}
        onConflictChange={setConflictPolicy}
        adbStatus={adbStatus}
        adbLoading={adbLoading}
        adbOpen={adbOpen}
        onAdbToggle={toggleAdb}
        onAdbRefresh={refreshAdb}
        showDeviceControls={connected}
      />

      {pausedReason && (
        <div className="notice err" role="alert">
          <IconAlert size={20} />
          <div className="notice-text">
            <strong>{t("paused.title")}</strong>
            <span>{t("paused.body")}</span>
            <span className="notice-detail selectable">{pausedReason}</span>
          </div>
          <button type="button" className="btn primary" onClick={() => refresh(true)} disabled={loading}>
            <IconRefresh size={15} />
            {t("refresh")}
          </button>
        </div>
      )}

      {!pausedReason && resumePending && (
        <div className="notice warn" role="status">
          <IconAlert size={20} />
          <div className="notice-text">
            <strong>{t("resume.title")}</strong>
            <span>{t("resume.body")}</span>
          </div>
          <button type="button" className="btn" onClick={clearQueue}>
            {t("resume.clear")}
          </button>
          <button type="button" className="btn primary" onClick={resumeQueue}>
            {t("resume.resume")}
          </button>
        </div>
      )}

      {connected && conflictPolicy === "overwrite" && (
        <div className="notice warn slim" role="status">
          <IconAlert size={15} />
          <span>{t("conflict.overwrite_note")}</span>
        </div>
      )}

      <main className="panes">
        <FilePane
          label={t("pane.local")}
          title={t("pane.local")}
          subtitle={t("pane.local_sub")}
          icon={<IconLaptop size={18} />}
          crumbs={localCrumbs}
          onUp={localParent ? () => loadLocalEntries(localParent) : undefined}
          items={localItems}
          error={localError}
          selected={localSel}
          onSelectionChange={setLocalSel}
          onOpen={(it) => it.isDir && loadLocalEntries(it.key)}
          onDragStart={(keys, p) => startDrag("local", keys, p)}
          footerHint={t("pane.local_hint")}
          dropHint={localDrop}
          paneRef={localPaneRef}
        />

        <div className="rail">
          <div className="rail-item">
            <button
              type="button"
              className="rail-btn"
              disabled={!deviceUsable || localSel.size === 0}
              onClick={() => sendLocalSelection([...localSel])}
              aria-label={t("rail.send_aria")}
              title={t("rail.send_aria")}
            >
              <IconArrowRight size={20} />
            </button>
            <span>{t("rail.send")}</span>
          </div>
          <div className="rail-item">
            <button
              type="button"
              className="rail-btn"
              disabled={!deviceUsable || deviceSel.size === 0}
              onClick={() => fetchDeviceSelection([...deviceSel])}
              aria-label={t("rail.get_aria")}
              title={t("rail.get_aria")}
            >
              <IconArrowLeft size={20} />
            </button>
            <span>{t("rail.get")}</span>
          </div>
        </div>

        <FilePane
          label={connected ? deviceName : t("pane.device_none")}
          title={connected ? deviceName : t("pane.device_none")}
          subtitle={connected ? activeStorage?.description || t("device.storage") : t("pane.device_none_sub")}
          icon={<IconPhone size={18} />}
          headerExtra={connected ? storageMeter : undefined}
          crumbs={deviceCrumbs}
          onUp={breadcrumb.length > 1 ? () => goToCrumb(breadcrumb.length - 2) : undefined}
          items={deviceItems}
          error={browserError}
          selected={deviceSel}
          onSelectionChange={setDeviceSel}
          onOpen={(it) => {
            const entry = entries.find((e) => String(e.itemId) === it.key);
            if (entry) enterDeviceFolder(entry);
          }}
          onDragStart={(keys, p) => startDrag("device", keys, p)}
          footerHint={t("pane.device_hint")}
          dropHint={deviceDrop}
          paneRef={devicePaneRef}
          placeholder={devicePlaceholder}
        />
      </main>

      <QueuePanel
        jobs={sortedJobs}
        groups={jobGroups}
        open={trayOpen}
        paused={!!pausedReason || resumePending}
        onToggle={() => setTrayOpen((v) => !v)}
        onCancel={cancelJobs}
      />

      {internalDrag && (
        <div className="drag-ghost" style={{ left: internalDrag.x + 14, top: internalDrag.y + 14 }}>
          {internalDrag.hasFolder && (
            <span className="kind-folder">
              <IconFolder size={18} />
            </span>
          )}
          <span className="ellipsis">{internalDrag.label}</span>
          {internalDrag.keys.length > 1 && <span className="ghost-count">+{internalDrag.keys.length - 1}</span>}
        </div>
      )}

      {adbConfirm && (
        <AdbConfirmDialog
          request={adbConfirm.request}
          onChoose={(choice) => {
            adbConfirm.resolve(choice);
            setAdbConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function rememberGroup(
  ids: number[],
  label: string,
  shouldGroup: boolean,
  setJobGroups: Dispatch<SetStateAction<Map<number, QueueGroupView>>>,
) {
  if (!shouldGroup || ids.length === 0) return;
  const group: QueueGroupView = { id: `${Date.now()}-${ids[0]}`, label, totalFiles: ids.length };
  setJobGroups((prev) => {
    const next = new Map(prev);
    for (const id of ids) next.set(id, group);
    return next;
  });
}

// Auto-routing helper. Pushes directory uploads through the ADB tar fast
// path when:
//   • exactly one ADB device is in `device` state and tar-capable
//   • we can confirm an internal-storage absolute root (/sdcard)
//   • the active MTP storage looks like internal storage (single storage
//     OR description contains internal/shared/phone). SD-card mapping is
//     out of scope (plan.md §2.1).
//   • dest path under /sdcard can be derived from the breadcrumb.
// Anything that fails a check is silently returned to the MTP path —
// this helper never throws on capability gaps. A folder the user
// cancels in the confirm dialog is reported as handled (nothing sent).
async function routeFoldersViaAdb(
  folderPaths: string[],
  storage: Storage,
  breadcrumb: BreadcrumbNode[],
  setJobGroups: Dispatch<SetStateAction<Map<number, QueueGroupView>>>,
  confirm: ConfirmFn,
  t: TFunction,
): Promise<{ handled: string[]; errors: string[]; status: AdbStatusWire | null }> {
  const handled: string[] = [];
  const errors: string[] = [];

  const raw = storage.description ?? "";
  const desc = raw.toLowerCase();
  // SD-card descriptions usually contain "sd"/"card"/"카드"/"외장"; gate them
  // out explicitly to avoid false positives on dual-storage devices.
  const looksSdCard = desc.includes("sd") || desc.includes("card") || raw.includes("카드") || raw.includes("외장");
  const looksInternal =
    !looksSdCard &&
    (desc.includes("internal") ||
      desc.includes("shared") ||
      desc.includes("phone") ||
      raw.includes("내부") ||
      raw.includes("공유") ||
      raw.includes("저장") ||
      desc === "" ||
      desc === "root");
  if (!looksInternal) return { handled, errors, status: null };

  let status: AdbStatusWire;
  try {
    status = await invoke<AdbStatusWire>("adb_status");
  } catch {
    return { handled, errors, status: null };
  }
  if (!status.adbAvailable) return { handled, errors, status };
  const ready = status.devices.filter((d) => d.state === "device" && d.canTarUpload && d.tarExtractSmokeOk);
  if (ready.length !== 1) return { handled, errors, status };
  const dev = ready[0];

  let root: string | null = null;
  try {
    root = await invoke<string | null>("adb_internal_storage_root", { serial: dev.serial });
  } catch {
    return { handled, errors, status };
  }
  if (!root) return { handled, errors, status };

  // breadcrumb[0] is the storage root label, not a real folder on /sdcard.
  const relParts = breadcrumb.slice(1).map((b) => b.name);
  const rel = relParts.join("/");
  const destBase = rel ? `${root}/${rel}` : root;
  const storageLabel = breadcrumb[0]?.name ?? "";

  for (const folder of folderPaths) {
    const folderName = basename(folder);
    const dest = `${destBase}/${folderName}`;
    let report: AdbPlanReport;
    try {
      report = await invoke<AdbPlanReport>("adb_plan_upload", { serial: dev.serial, source: folder, destPath: dest });
    } catch (e) {
      // Plan failure → don't claim this folder; let MTP handle it.
      errors.push(t("adb.prep_failed", { folderName, error: errText(e) }));
      continue;
    }

    const totalConflicts = report.skippedSame.length + report.renamed.length;
    if (totalConflicts > 0) {
      const choice = await confirm({
        folderName,
        destLabel: [storageLabel, ...relParts, folderName].filter(Boolean).join(" › "),
        report,
      });
      if (choice === "cancel") {
        handled.push(folder); // user backed out — send nothing
        continue;
      }
      if (choice === "mtp") continue; // falls through to MTP
    }

    try {
      const id = await invoke<number>("enqueue_adb_tar_upload", { planToken: report.planToken });
      rememberGroup([id], folderName, true, setJobGroups);
      handled.push(folder);
    } catch (e) {
      errors.push(t("adb.start_failed", { folderName, error: errText(e) }));
    }
  }
  return { handled, errors, status };
}

function buildLocalCrumbs(path: string, home: string): { label: string; path: string }[] {
  if (!path) return [];
  const isWindows = path.includes("\\");
  const sep = isWindows ? "\\" : "/";
  // Under the home folder, start the trail at the home folder name.
  if (home && (path === home || path.startsWith(home + sep))) {
    const crumbs = [{ label: basename(home), path: home }];
    let current = home;
    for (const part of path.slice(home.length).split(/[\\/]/).filter(Boolean)) {
      current = `${current}${sep}${part}`;
      crumbs.push({ label: part, path: current });
    }
    return crumbs;
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (isWindows) {
    const drive = parts[0] ?? path;
    return [
      { label: drive, path: `${drive}\\` },
      ...parts.slice(1).map((p, i) => ({ label: p, path: `${parts.slice(0, i + 2).join(sep)}\\` })),
    ];
  }
  const crumbs = [{ label: "/", path: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

function parentPath(path: string): string | null {
  if (!path) return null;
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0) return null;
  if (idx === 0) return trimmed === "" ? null : "/";
  const parent = trimmed.slice(0, idx);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

function pointInElement(point: { x: number; y: number }, element: HTMLElement | null): boolean {
  if (!element) return false;
  const r = element.getBoundingClientRect();
  return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
}

/** Exponentially smoothed transfer rate, sampled at most every 0.5 s. */
function withRate(job: JobView, sent: number): Partial<JobView> {
  const now = Date.now();
  if (job.sampleAt === undefined || sent < (job.sampleSent ?? 0)) {
    return { sampleAt: now, sampleSent: sent };
  }
  const dt = (now - job.sampleAt) / 1000;
  if (dt < 0.5) return {};
  const inst = (sent - (job.sampleSent ?? 0)) / dt;
  const rate = job.rate ? job.rate * 0.7 + inst * 0.3 : inst;
  return { sampleAt: now, sampleSent: sent, rate };
}

function applyEvent(prev: Map<number, JobView>, ev: TransferEvent): Map<number, JobView> {
  const next = new Map(prev);
  switch (ev.type) {
    case "enqueued":
      next.set(ev.id, { id: ev.id, kind: ev.kind, state: { tag: "queued" }, sent: 0, total: 0, startedAt: Date.now() });
      break;
    case "stateChanged": {
      const job = next.get(ev.id);
      if (job) {
        const reset = ev.state.tag !== "transferring" ? { rate: undefined, sampleAt: undefined } : {};
        next.set(ev.id, { ...job, ...reset, state: ev.state });
      }
      break;
    }
    case "progress": {
      const job = next.get(ev.id);
      if (job) next.set(ev.id, { ...job, ...withRate(job, ev.sent), sent: ev.sent, total: ev.total });
      break;
    }
    case "bulkProgress": {
      const job = next.get(ev.id);
      if (job) {
        next.set(ev.id, { ...job, currentFile: ev.currentFile, filesDone: ev.filesDone, totalFiles: ev.totalFiles });
      }
      break;
    }
    case "queuePaused":
    case "workerStopped":
      break;
  }
  return next;
}
