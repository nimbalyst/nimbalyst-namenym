import React, {
  Fragment,
  useEffect,
  useRef,
  useState,
  useContext,
} from "react";
import { normalize, type NamenymProject, type Mashup } from "../types";
import { ProjectEditingContext } from "../collab/ProjectText";
import { NameComparison, NameDetail } from "./NameReview";
import { favoriteMembers } from "../preferences";
import {
  NameDomainDetails,
  NameDomainToolbar,
  nameDomainLabel,
} from "./NameDomainDetails";
import type { Action } from "../state";
import { InlineAdd } from "./InlineAdd";
import { useDomains } from "../useDomains";
import { currentDomainCheck, hasAvailableCom } from "../domains";
interface Props {
  project: NamenymProject;
  apply: (a: Action) => void;
  generate: (direction?: string) => void;
  naming: boolean;
  progress: string;
  notice: (text: string, undo?: () => void) => void;
  firstRun: React.ReactNode;
  aiAvailable: boolean;
  shared: boolean;
  favoriteScope?: string;
  onSelection?: (id: string | null) => void;
}
export function NamesPanel({
  project: p,
  apply,
  generate,
  naming,
  progress,
  notice,
  firstRun,
  aiAvailable,
  shared,
  favoriteScope,
  onSelection,
}: Props) {
  const { readOnly } = useContext(ProjectEditingContext);
  const supporters = (id: string) => favoriteMembers(p, id, favoriteScope);
  const [filter, setFilter] = useState<
    "names" | "shortlist" | "team" | "imported" | "hidden"
  >("names");
  const [selected, updateSelected] = useState<string | null>(null);
  const setSelected = (id: string | null) => {
    updateSelected(id);
    onSelection?.(id);
  };
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; label: string } | null>(null);
  const [compare, setCompare] = useState(false);
  const [columns, setColumns] = useState(1);
  const [availableOnly, setAvailableOnly] = useState(false);
  const domains = useDomains(p.mashups, apply, {
    automatic: !shared,
    readOnly,
  });
  const grid = useRef<HTMLDivElement>(null);
  const inList = (m: Mashup, tab: typeof filter) =>
    tab === "hidden"
      ? m.hidden
      : !m.hidden &&
        (tab === "shortlist"
          ? p.shortlisted.includes(m.id)
          : tab === "team"
          ? supporters(m.id).length > 0
          : tab === "imported"
          ? p.importedShortlist?.includes(m.id)
          : true);
  const listNames = p.mashups.filter((m) => inList(m, filter));
  if (filter === "team")
    listNames.sort(
      (a, b) =>
        supporters(b.id).length - supporters(a.id).length ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id)
    );
  const names = listNames.filter((m) => !availableOnly || hasAvailableCom(m));
  const domainLabel = (m: Mashup) => nameDomainLabel(m, domains);
  const domainDetails = (m: Mashup) => (
    <NameDomainDetails
      name={m}
      domains={domains}
      domainLabel={domainLabel}
      readOnly={readOnly}
    />
  );
  useEffect(() => {
    if (!grid.current) return;
    const observer = new ResizeObserver(() => {
      const count = getComputedStyle(grid.current!).gridTemplateColumns.split(
        " "
      ).length;
      setColumns(count);
    });
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, []);
  const detail = p.mashups.find(
    (m) => m.id === selected && names.some((n) => n.id === m.id)
  );
  const detailIndex = detail
    ? Math.min(
        names.length - 1,
        Math.floor(names.findIndex((m) => m.id === detail.id) / columns) *
          columns +
          columns -
          1
      )
    : -1;
  function focus(id: string) {
    setFocused(id);
    requestAnimationFrame(() => document.getElementById(`name-${id}`)?.focus());
  }
  function hide(m: Mashup) {
    if (readOnly) return;
    apply({ type: "REMOVE_MASHUP", id: m.id });
    setMenu(null);
    setSelected(null);
    notice(
      `${m.hidden ? "Restored" : shared ? "Archived" : "Hidden"} ${m.label}`,
      () => apply({ type: "REMOVE_MASHUP", id: m.id })
    );
  }
  function actions(m: Mashup) {
    return (
      <>
        <button
          disabled={readOnly || !aiAvailable}
          onClick={() => {
            setMenu(null);
            generate(`More like ${m.label}`);
          }}
        >
          More like this
        </button>
        <button
          disabled={readOnly}
          onClick={() => {
            setMenu(null);
            setEdit({ id: m.id, label: m.label });
          }}
        >
          Edit
        </button>
        <button disabled={readOnly} onClick={() => hide(m)}>
          {m.hidden ? "Restore" : shared ? "Archive" : "Hide"}
        </button>
        {!m.hidden && (
          <button
            disabled={readOnly}
            onClick={() => {
              setMenu(null);
              domains.recheck([m]);
            }}
          >
            Check domains
          </button>
        )}
      </>
    );
  }
  function saveEdit() {
    if (!edit || readOnly) return;
    const duplicate = p.mashups.find(
      (m) => m.id !== edit.id && normalize(m.label) === normalize(edit.label)
    );
    if (duplicate) {
      notice(`“${duplicate.label}” already exists.`);
      setEdit(null);
      focus(duplicate.id);
      return;
    }
    if (!edit.label.trim() || edit.label.length > 120) {
      notice("Names must be 1–120 characters.");
      return;
    }
    apply({ type: "EDIT_ITEM", kind: "mashups", ...edit });
    setEdit(null);
    focus(edit.id);
  }
  function keys(e: React.KeyboardEvent, id: string, index: number) {
    if (e.target !== e.currentTarget) return;
    const key = e.key.toLowerCase();
    const offset = {
      arrowright: 1,
      arrowleft: -1,
      arrowdown: columns,
      arrowup: -columns,
    }[key];
    if (offset !== undefined) {
      e.preventDefault();
      focus(names[Math.max(0, Math.min(names.length - 1, index + offset))].id);
    } else if (
      ["enter", "s", "e", "h", "m", "escape", "home", "end"].includes(key)
    ) {
      e.preventDefault();
      const m = names[index];
      if (key === "enter") setSelected(selected === id ? null : id);
      if (key === "s" && !readOnly) apply({ type: "TOGGLE_SHORTLIST", id });
      if (key === "e" && !readOnly) setEdit({ id, label: m.label });
      if (key === "h") hide(m);
      if (key === "m") setMenu(menu === id ? null : id);
      if (key === "escape") {
        setMenu(null);
        setSelected(null);
      }
      if (key === "home") focus(names[0].id);
      if (key === "end") focus(names[names.length - 1].id);
    }
  }
  return (
    <main className="nn-names">
      <div className="nn-names-toolbar">
        <div role="tablist" aria-label="Name lists">
          {(
            [
              "names",
              "shortlist",
              ...(shared ? ["team"] : []),
              ...(shared && p.importedShortlist?.length ? ["imported"] : []),
              ...(filter === "hidden" ? ["hidden"] : []),
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={filter === tab}
              onClick={() => {
                setFilter(tab as typeof filter);
                setSelected(null);
              }}
            >
              {tab === "names"
                ? "Names"
                : tab === "shortlist"
                ? shared
                  ? "My favorites"
                  : "Shortlist"
                : tab === "team"
                ? "Team favorites"
                : tab === "imported"
                ? "Imported shortlist"
                : shared
                ? "Archived"
                : "Hidden"}{" "}
              <span>
                {
                  p.mashups.filter((m) => inList(m, tab as typeof filter))
                    .length
                }
              </span>
            </button>
          ))}
        </div>
        <details className="nn-menu">
          <summary aria-label="More name actions">⋯</summary>
          <div>
            <button onClick={() => setFilter("hidden")}>
              {shared ? "Archived names" : "Hidden names"}
            </button>
            <button onClick={() => setCompare(!compare)}>
              {shared ? "Compare team favorites" : "Compare shortlist"}
            </button>
          </div>
        </details>
        <span className="nn-progress" role="status">
          {progress}
        </span>
        <InlineAdd
          label="Add a name"
          onAdd={(labels) => {
            const old = new Set(p.mashups.map((m) => normalize(m.label)));
            const duplicate = p.mashups.find((m) =>
              labels.some((l) => normalize(l) === normalize(m.label))
            );
            apply({
              type: "ADD_MASHUPS",
              mashups: labels.map((label) => ({ label, source: "manual" })),
            });
            setFilter(duplicate?.hidden ? "hidden" : "names");
            notice(
              `${
                new Set(labels.map(normalize).filter((x) => !old.has(x))).size
              } name(s) added${
                duplicate ? `; “${duplicate.label}” already exists` : ""
              }.`
            );
            if (duplicate) focus(duplicate.id);
          }}
        />
      </div>
      {p.mashups.length > 0 && (
        <NameDomainToolbar
          listNames={listNames}
          domains={domains}
          readOnly={readOnly}
          availableOnly={availableOnly}
          setAvailableOnly={setAvailableOnly}
        />
      )}
      {compare && (
        <NameComparison
          project={p}
          shared={shared}
          favoriteScope={favoriteScope}
          apply={apply}
          domainDetails={domainDetails}
          onClose={() => setCompare(false)}
        />
      )}
      {!p.mashups.length && firstRun}
      <p id="nn-grid-help" className="nn-sr-only">
        Arrow keys move between names. Enter toggles details. S shortlists. E
        edits. H hides. M opens actions. Escape closes actions and details.
      </p>
      <div
        className="nn-names-grid"
        ref={grid}
        role="group"
        aria-label="Name candidates"
        aria-describedby="nn-grid-help"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setMenu(null);
            setSelected(null);
            setEdit(null);
          }
        }}
      >
        {names.map((m, index) => (
          <Fragment key={m.id}>
            <div
              id={`name-${m.id}`}
              role="group"
              aria-label={m.label}
              aria-expanded={selected === m.id}
              tabIndex={
                (
                  focused && names.some((n) => n.id === focused)
                    ? focused === m.id
                    : index === 0
                )
                  ? 0
                  : -1
              }
              onFocus={() => setFocused(m.id)}
              onKeyDown={(e) => keys(e, m.id, index)}
              className={`nn-name-tile ${
                p.shortlisted.includes(m.id) ? "nn-shortlisted" : ""
              } ${selected === m.id ? "nn-selected" : ""}`}
            >
              <button
                disabled={readOnly}
                className="nn-star"
                tabIndex={-1}
                aria-label={`${shared ? "Favorite" : "Shortlist"} ${m.label}`}
                aria-pressed={p.shortlisted.includes(m.id)}
                onClick={() => apply({ type: "TOGGLE_SHORTLIST", id: m.id })}
              >
                {p.shortlisted.includes(m.id) ? "★" : "☆"}
              </button>
              <div className="nn-name-main">
                {edit?.id === m.id ? (
                  <input
                    autoFocus
                    readOnly={readOnly}
                    className="nn-name-edit"
                    aria-label="Edit name"
                    value={edit.label}
                    onChange={(e) =>
                      setEdit({ ...edit, label: e.target.value })
                    }
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setEdit(null);
                        focus(m.id);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="nn-name-label"
                    tabIndex={-1}
                    onClick={() => setSelected(selected === m.id ? null : m.id)}
                  >
                    {m.label}
                  </button>
                )}
                {shared && supporters(m.id).length > 0 && (
                  <small
                    className="nn-favorite-count"
                    title={supporters(m.id)
                      .map((f) => f.memberName)
                      .join(", ")}
                  >
                    {supporters(m.id).length}{" "}
                    {supporters(m.id).length === 1 ? "favorite" : "favorites"}
                  </small>
                )}
                {p.mashups.some(
                  (n) =>
                    n.id !== m.id && normalize(n.label) === normalize(m.label)
                ) && <small className="nn-duplicate">Duplicate name</small>}
                <button
                  className={`nn-domain-badge ${
                    hasAvailableCom(m) && domains.jobFor(m)?.status !== "failed"
                      ? "nn-domain-available"
                      : ""
                  }`}
                  aria-label={`Domain availability for ${
                    m.label
                  }: ${domainLabel(m)}`}
                  title={
                    domains.jobFor(m)?.error ||
                    (currentDomainCheck(m)
                      ? `Checked ${new Date(
                          currentDomainCheck(m)!.checkedAt
                        ).toLocaleString()}`
                      : "Domain availability")
                  }
                  onClick={() => setSelected(selected === m.id ? null : m.id)}
                >
                  {domainLabel(m)}
                </button>
              </div>
              <button
                className="nn-tile-menu"
                tabIndex={-1}
                title={`Actions for ${m.label}`}
                aria-label={`Actions for ${m.label}`}
                aria-expanded={menu === m.id}
                onClick={() => setMenu(menu === m.id ? null : m.id)}
              >
                ⋯
              </button>
              {menu === m.id && (
                <div className="nn-tile-menu-list">{actions(m)}</div>
              )}
            </div>
            {detail && index === detailIndex && (
              <NameDetail
                project={p}
                detail={detail}
                shared={shared}
                favoriteScope={favoriteScope}
                apply={apply}
                actions={actions}
                domainDetails={domainDetails}
                onClose={() => {
                  setSelected(null);
                  focus(detail.id);
                }}
              />
            )}
          </Fragment>
        ))}
        {naming &&
          Array.from({ length: 4 }, (_, i) => (
            <div
              aria-hidden="true"
              className="nn-skeleton"
              key={`skeleton-${i}`}
            />
          ))}
      </div>
      {!names.length && p.mashups.length > 0 && (
        <p className="nn-empty">
          {availableOnly
            ? "No available .com matches in this list. Turn off the filter to see all names and check results."
            : filter === "shortlist"
            ? shared
              ? "Star a name to add it to your favorites."
              : "Star a name to start your shortlist."
            : filter === "hidden"
            ? shared
              ? "No archived names."
              : "No hidden names."
            : "Add a name or generate a round."}
        </p>
      )}
    </main>
  );
}
