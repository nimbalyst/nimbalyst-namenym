import React, { useState, useContext } from "react";
import { ProjectEditingContext } from "../collab/ProjectText";
import { validLabel } from "../state";
export function InlineAdd({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (labels: string[]) => void;
}) {
  const { readOnly } = useContext(ProjectEditingContext);
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  function submit(split = false) {
    if (readOnly) return;
    const labels = value
      .split(split ? /[,;\n]+/ : /\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!labels.length) return;
    if (labels.length > 100 || !labels.every(validLabel)) {
      setError("Use up to 100 entries, each 1–120 characters.");
      return;
    }
    onAdd(labels);
    setValue("");
    setPreview(false);
    setError("");
  }
  return (
    <div className="nn-add">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (/[,;]/.test(value)) setPreview(true);
          else submit();
        }}
      >
        <textarea
          disabled={readOnly}
          aria-label={label}
          placeholder={label.startsWith("Add word to ") ? "Add word" : label}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (/[,;]/.test(value)) setPreview(true);
              else submit();
            }
          }}
        />
        <button
          disabled={readOnly}
          type="submit"
          aria-label={`Submit ${label.toLowerCase()}`}
          title="Add (Enter)"
        >
          +
        </button>
      </form>
      {preview && (
        <div className="nn-add-preview">
          Keep “{value}” together, or split at commas and semicolons?
          <button onClick={() => submit()}>Keep phrases</button>
          <button onClick={() => submit(true)}>Split into entries</button>
          <button onClick={() => setPreview(false)}>Cancel</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
