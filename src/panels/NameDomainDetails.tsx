import React from "react";
import type { Mashup } from "../types";
import type { useDomains } from "../useDomains";
import {
  currentDomainCheck,
  domainQuery,
  hasAvailableCom,
  freshDomainCheck,
} from "../domains";
export function NameDomainDetails({
  name: m,
  domains,
  domainLabel,
  readOnly,
}: {
  name: Mashup;
  domains: ReturnType<typeof useDomains>;
  domainLabel: (m: Mashup) => string;
  readOnly: boolean;
}) {
  const check = currentDomainCheck(m);
  const job = domains.jobFor(m);
  const pending = job && ["queued", "running"].includes(job.status);
  return (
    <div className="nn-domain-details">
      <strong>
        {domainQuery(m.label)
          ? `${domainQuery(m.label)}.com`
          : "Domain availability"}
      </strong>
      <p>{domainLabel(m)}</p>
      {job?.status === "failed" && <p role="alert">{job.error}</p>}
      {!domainQuery(m.label) && (
        <p>
          Use letters, numbers, or hyphens for a domain check. Spaces are
          joined; punctuation and accented names need editing.
        </p>
      )}
      {check && (
        <>
          <small>
            Last result: {new Date(check.checkedAt).toLocaleString()} · Namenym
            / Domainr
          </small>
          <div className="nn-domain-links">
            {check.availableDomains.map((d) => (
              <a
                key={d.domain}
                href={`https://domainr.com/${encodeURIComponent(d.domain)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {d.domain} ↗
              </a>
            ))}
          </div>
          <small>
            The API lists available matches for .com, .ai, .net, and .org. A
            missing domain was not reported available. Confirm current
            availability and price with the registrar.
          </small>
        </>
      )}
      <button
        disabled={readOnly || !!pending || !!m.hidden || !domainQuery(m.label)}
        onClick={() => domains.recheck([m])}
      >
        {pending
          ? "Checking domains…"
          : job?.status === "failed"
          ? "Retry domain check"
          : "Recheck domains"}
      </button>
    </div>
  );
}

export function NameDomainToolbar({
  listNames,
  domains,
  readOnly,
  availableOnly,
  setAvailableOnly,
}: {
  listNames: Mashup[];
  domains: ReturnType<typeof useDomains>;
  readOnly: boolean;
  availableOnly: boolean;
  setAvailableOnly: (value: boolean) => void;
}) {
  return (
    <div className="nn-domain-toolbar">
      <label>
        <input
          type="checkbox"
          checked={availableOnly}
          onChange={(e) => setAvailableOnly(e.target.checked)}
        />{" "}
        Available .com only
      </label>
      <span role="status">
        {domains.pending
          ? `Checking domains · ${domains.pending} remaining`
          : domains.paused
          ? "Domain checks paused"
          : `${listNames.filter(hasAvailableCom).length} .com available`}
      </span>
      {domains.pending > 0 ? (
        <button onClick={domains.stop}>Stop domain checks</button>
      ) : (
        <button
          disabled={readOnly}
          onClick={() => domains.recheck(listNames.filter((m) => !m.hidden))}
        >
          {domains.paused ? "Resume domain checks" : "Recheck domains"}
        </button>
      )}
    </div>
  );
}

export function nameDomainLabel(
  m: Mashup,
  domains: ReturnType<typeof useDomains>
) {
  const job = domains.jobFor(m);
  if (!domainQuery(m.label)) return ".com needs a valid name";
  if (job?.status === "running") return ".com checking…";
  if (job?.status === "queued") return ".com queued…";
  if (job?.status === "failed") return ".com check failed";
  const check = currentDomainCheck(m);
  if (!check) return ".com not checked";
  return `${hasAvailableCom(m) ? ".com available" : ".com not listed"}${
    freshDomainCheck(m) ? "" : " · earlier check"
  }`;
}
