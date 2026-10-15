// One side of the two-pane browser. Used for both the local Mac folder
// and the device storage so selection, sorting, keyboard handling and
// drag start behave identically on both sides.

import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { fileKind, formatBytes, formatDate } from "../format";
import { FileKindIcon, IconBolt, IconChevronLeft, IconDropInto, IconFolder } from "./icons";

export interface PaneItem {
  key: string;
  name: string;
  isDir: boolean;
  size: number;
  modifiedSecs: number | null;
}

export interface Crumb {
  label: string;
  onClick: () => void;
}

export interface DropHint {
  path: string;
  fast: boolean;
  policy: string;
}

interface Props {
  label: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  headerExtra?: ReactNode;
  crumbs: Crumb[];
  onUp?: () => void;
  items: PaneItem[];
  error: string | null;
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onOpen: (item: PaneItem) => void;
  /** Fired once the pointer moves past the drag threshold. */
  onDragStart: (keys: string[], point: { x: number; y: number }) => void;
  footerHint: string;
  dropHint?: DropHint | null;
  paneRef?: Ref<HTMLElement>;
  /** Replaces the list (e.g. connection guide when no device). */
  placeholder?: ReactNode;
}

type SortKey = "name" | "date" | "size";

const DRAG_THRESHOLD = 4;

export function FilePane(props: Props) {
  const { t, i18n } = useTranslation();
  const {
    items,
    selected,
    onSelectionChange,
    onOpen,
    onDragStart,
    dropHint,
    placeholder,
  } = props;
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const anchorRef = useRef<string | null>(null);
  const pressRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sortKey === "date") cmp = (a.modifiedSecs ?? 0) - (b.modifiedSecs ?? 0);
      if (sortKey === "size") cmp = a.size - b.size;
      return sortAsc ? cmp : -cmp;
    });
  }, [items, sortKey, sortAsc]);

  // Pointer press → drag once the pointer travels past the threshold.
  // A press that never moves is a plain click (selection).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) < DRAG_THRESHOLD) return;
      pressRef.current = null;
      let keys: string[];
      if (selected.has(press.key)) {
        keys = sorted.filter((it) => selected.has(it.key)).map((it) => it.key);
      } else {
        keys = [press.key];
        onSelectionChange(new Set(keys));
      }
      onDragStart(keys, { x: e.clientX, y: e.clientY });
    };
    const onUp = () => {
      pressRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [selected, sorted, onSelectionChange, onDragStart]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const clickRow = (e: ReactMouseEvent, item: PaneItem) => {
    if (e.shiftKey && anchorRef.current) {
      const from = sorted.findIndex((it) => it.key === anchorRef.current);
      const to = sorted.findIndex((it) => it.key === item.key);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        onSelectionChange(new Set(sorted.slice(lo, hi + 1).map((it) => it.key)));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      onSelectionChange(next);
    } else {
      onSelectionChange(new Set([item.key]));
    }
    anchorRef.current = item.key;
  };

  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (sorted.length === 0) return;
    const current = sorted.findIndex((it) => it.key === anchorRef.current);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? Math.min(sorted.length - 1, current + 1)
          : Math.max(0, current < 0 ? 0 : current - 1);
      const key = sorted[next].key;
      anchorRef.current = key;
      onSelectionChange(new Set([key]));
      listRef.current
        ?.querySelector(`[data-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault();
      onOpen(sorted[current]);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelectionChange(new Set(sorted.map((it) => it.key)));
    } else if (e.key === "Escape") {
      onSelectionChange(new Set());
    }
  };

  const selectedItems = sorted.filter((it) => selected.has(it.key));
  const selectedBytes = selectedItems.reduce((sum, it) => sum + (it.isDir ? 0 : it.size), 0);
  const summary =
    selectedItems.length > 0
      ? selectedBytes > 0
        ? t("pane.selected_size", { count: selectedItems.length, size: formatBytes(selectedBytes) })
        : t("pane.selected", { count: selectedItems.length })
      : t("pane.items", { count: items.length });

  const sortLabel = (key: SortKey, label: string) => (
    <button
      type="button"
      className={`sort ${sortKey === key ? "active" : ""} ${key === "size" ? "right" : ""}`}
      onClick={() => toggleSort(key)}
      aria-sort={sortKey === key ? (sortAsc ? "ascending" : "descending") : undefined}
    >
      {label}
      {sortKey === key && (sortAsc ? " ↑" : " ↓")}
    </button>
  );

  return (
    <section className={`pane ${dropHint ? "drop-active" : ""}`} aria-label={props.label} ref={props.paneRef}>
      <div className="pane-head">
        <span className="pane-icon">{props.icon}</span>
        <div className="pane-titles">
          <h2>{props.title}</h2>
          <span className="sub">{props.subtitle}</span>
        </div>
        <span className="spacer" />
        {props.headerExtra}
      </div>

      {placeholder ? (
        placeholder
      ) : (
        <>
          <nav className="crumbs" aria-label={t("pane.path")}>
            <button
              type="button"
              className="btn ghost icon"
              onClick={props.onUp}
              disabled={!props.onUp}
              aria-label={t("pane.up")}
              title={t("pane.up")}
            >
              <IconChevronLeft />
            </button>
            <div className="crumb-list">
              {props.crumbs.map((c, i) => {
                const last = i === props.crumbs.length - 1;
                return (
                  <span key={`${c.label}-${i}`} className="crumb-wrap">
                    {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
                    <button
                      type="button"
                      className={`crumb ${last ? "current" : ""}`}
                      aria-current={last ? "page" : undefined}
                      onClick={c.onClick}
                    >
                      {c.label}
                    </button>
                  </span>
                );
              })}
            </div>
          </nav>

          <div className="list-head">
            {sortLabel("name", t("browser.name"))}
            {sortLabel("date", t("browser.date"))}
            {sortLabel("size", t("browser.size"))}
          </div>

          {props.error && (
            <div className="pane-error" role="alert">
              {props.error}
            </div>
          )}

          <div
            className="list"
            ref={listRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={props.title}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelectionChange(new Set());
            }}
          >
            {sorted.length === 0 && !props.error && <div className="list-empty">{t("browser.empty")}</div>}
            {sorted.map((it) => {
              const kind = fileKind(it.name, it.isDir);
              return (
                <div
                  key={it.key}
                  data-key={it.key}
                  role="option"
                  aria-selected={selected.has(it.key)}
                  className="row"
                  onPointerDown={(e: ReactPointerEvent) => {
                    if (e.button !== 0) return;
                    pressRef.current = { key: it.key, x: e.clientX, y: e.clientY };
                  }}
                  onClick={(e) => clickRow(e, it)}
                  onDoubleClick={() => onOpen(it)}
                >
                  <span className="cell-name">
                    <span className={`kind kind-${kind}`}>
                      <FileKindIcon kind={kind} />
                    </span>
                    <span className="name" title={it.name}>
                      {it.name}
                    </span>
                  </span>
                  <span className="cell-dim">{formatDate(it.modifiedSecs, i18n.language, t)}</span>
                  <span className="cell-dim num right">{it.isDir ? "—" : formatBytes(it.size)}</span>
                </div>
              );
            })}
          </div>

          <div className="pane-foot">
            <span className="num">{summary}</span>
            <span className="spacer" />
            <span className="hint">{props.footerHint}</span>
          </div>
        </>
      )}

      {dropHint && (
        <div className="drop-overlay" aria-live="polite">
          <span className="drop-circle">
            <IconDropInto size={26} />
          </span>
          <strong>{t("drop.title")}</strong>
          <span className="drop-path">
            <span className="kind-folder">
              <IconFolder size={16} />
            </span>
            {dropHint.path}
          </span>
          {dropHint.fast && (
            <span className="badge fast big">
              <IconBolt size={12} />
              {t("drop.fast")}
            </span>
          )}
          <span className="drop-note">{dropHint.policy}</span>
        </div>
      )}
    </section>
  );
}
