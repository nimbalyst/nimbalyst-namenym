import React from "react";
import { STYLE_LABELS, type NamenymProject, type Mashup } from "../types";
import type { Action } from "../state";
import { ProjectText } from "../collab/ProjectText";
import { favoriteMembers } from "../preferences";
interface Props {
  project: NamenymProject;
  shared: boolean;
  favoriteScope?: string;
  apply: (action: Action) => void;
  domainDetails: (name: Mashup) => React.ReactNode;
  onClose: () => void;
}
export function NameComparison({
  project: p,
  shared,
  favoriteScope,
  apply,
  domainDetails,
  onClose,
}: Props) {
  const supporters = (id: string) => favoriteMembers(p, id, favoriteScope);
  return (
    <section className="nn-comparison">
      <h2>{shared ? "Compare team favorites" : "Compare shortlist"}</h2>
      <p>Qualitative notes · Trademarks: not checked</p>
      {p.mashups
        .filter(
          (m) =>
            (shared
              ? supporters(m.id).length > 0
              : p.shortlisted.includes(m.id)) && !m.hidden
        )
        .map((m) => (
          <article key={m.id}>
            <strong>{m.label}</strong>
            <p>{m.rationale || "No rationale recorded"}</p>
            {domainDetails(m)}
            <label>
              Notes
              <ProjectText
                field={`notes:${m.id}`}
                aria-label={`Notes for ${m.label}`}
                value={m.notes || ""}
                onChange={(value) =>
                  apply({
                    type: "SET_NOTES",
                    id: m.id,
                    notes: value,
                  })
                }
              />
            </label>
          </article>
        ))}
      <button onClick={onClose}>Close comparison</button>
    </section>
  );
}
export function NameDetail({
  project: p,
  detail,
  shared,
  favoriteScope,
  apply,
  actions,
  domainDetails,
  onClose,
}: Props & { detail: Mashup; actions: (name: Mashup) => React.ReactNode }) {
  const supporters = (id: string) => favoriteMembers(p, id, favoriteScope);
  return (
    <section className="nn-detail">
      <div>
        <h2>{detail.label}</h2>
        {shared && (
          <p>
            {supporters(detail.id).length
              ? `Favored by ${supporters(detail.id)
                  .map((f) => f.memberName)
                  .join(", ")}`
              : "No favorites yet"}
          </p>
        )}
        {shared &&
          (p.favorites ?? []).some(
            (f) => f.nameId === detail.id && f.scope !== favoriteScope
          ) && (
            <p>
              Earlier document favorites:{" "}
              {(p.favorites ?? [])
                .filter(
                  (f) => f.nameId === detail.id && f.scope !== favoriteScope
                )
                .map((f) => f.memberName)
                .join(", ")}{" "}
              (excluded from this team's totals)
            </p>
          )}
        <p>
          {detail.source === "manual"
            ? "Added by hand"
            : detail.style
            ? STYLE_LABELS[detail.style]
            : "Generated name"}
          {detail.sources.length > 0 &&
            " · " +
              detail.sources
                .map(
                  (s) =>
                    p.concepts.find((c) => c.id === s.id)?.label ??
                    p.synonyms.find((w) => w.id === s.id)?.label
                )
                .filter(Boolean)
                .join(", ")}
        </p>
        <p>{detail.rationale || "No rationale recorded"}</p>
        <div className="nn-detail-actions">{actions(detail)}</div>
        {detail.round && (
          <small>
            {detail.round.direction || "New directions"} ·{" "}
            {new Date(detail.round.created).toLocaleDateString()}
          </small>
        )}
      </div>
      <div>
        <label>
          Notes
          <ProjectText
            field={`notes:${detail.id}`}
            aria-label="Notes"
            value={detail.notes ?? ""}
            onChange={(value) =>
              apply({
                type: "SET_NOTES",
                id: detail.id,
                notes: value,
              })
            }
          />
        </label>
        {domainDetails(detail)}
        <p>Trademarks: not checked</p>
      </div>
      <button
        className="nn-close"
        aria-label="Close name details"
        onClick={onClose}
      >
        ×
      </button>
    </section>
  );
}
