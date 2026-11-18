import { useState } from "react";
import { sortFields } from "../lib/fields.js";

const NUM_KEYS = ["x", "y", "w", "h"];

export default function Sidebar({ fields, existing, pageCount, selected, code, onSelect, onChange, onDelete, onImport }) {
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [copied, setCopied] = useState(false);

  const existingNames = new Set(existing.map((e) => e.name));
  const nameProblem = !selected
    ? ""
    : !selected.name
    ? "Name is required."
    : existingNames.has(selected.name)
    ? "This name is already a field in the PDF."
    : fields.filter((f) => f.name === selected.name).length > 1
    ? "Another field has this name."
    : "";

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function runImport() {
    try {
      onImport(importText);
      setImporting(false);
      setImportText("");
      setImportError("");
    } catch (err) {
      setImportError(`Could not read that: ${err.message}`);
    }
  }

  return (
    <aside className="sidebar">
      <section>
        <h2>Selected field</h2>
        {!selected ? (
          <p className="muted">Draw or click a box to edit it.</p>
        ) : (
          <>
            <label className="f">Name (used in pdf-lib)</label>
            <input
              autoFocus
              spellCheck={false}
              value={selected.name}
              onChange={(e) => onChange(selected.id, { name: e.target.value.trim() })}
            />
            <p className="warn">{nameProblem}</p>

            <label className="f">Type</label>
            <div className="seg">
              {["text", "checkbox"].map((t) => (
                <button
                  key={t}
                  className={selected.type === t ? "on" : ""}
                  onClick={() => onChange(selected.id, { type: t })}
                >
                  {t === "text" ? "Text" : "Checkbox"}
                </button>
              ))}
            </div>

            <div className="row">
              {NUM_KEYS.map((k) => (
                <div key={k}>
                  <label className="f">{k}</label>
                  <input
                    type="number"
                    value={selected[k]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) onChange(selected.id, { [k]: Math.max(k === "w" || k === "h" ? 1 : 0, v) });
                    }}
                  />
                </div>
              ))}
            </div>
            <button className="mt" onClick={() => onDelete(selected.id)}>Delete field</button>
          </>
        )}
      </section>

      <section className="list-head">
        <h2>Fields {fields.length > 0 && `(${fields.length})`}</h2>
      </section>
      <div className="list">
        {fields.length === 0 && <p className="muted">No fields yet.</p>}
        {sortFields(fields).map((f) => (
          <div
            key={f.id}
            className={`item${selected?.id === f.id ? " sel" : ""}`}
            onClick={() => onSelect(f.id)}
          >
            <span className={`dot ${f.type}`} />
            <span className="name">{f.name || "(unnamed)"}</span>
            {pageCount > 1 && <span className="muted">p{f.page + 1}</span>}
            <span className="muted">{f.type === "checkbox" ? "☐" : "T"}</span>
          </div>
        ))}
        {existing.length > 0 && (
          <>
            <h2 className="sub">Already in the PDF ({existing.length})</h2>
            {existing.map((f, i) => (
              <div key={i} className="item locked" title="Kept as-is in the output">
                <span className="dot existing" />
                <span className="name">{f.name}</span>
                {pageCount > 1 && <span className="muted">p{f.page + 1}</span>}
                <span className="muted">{f.type}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <section className="output">
        <div className="row center">
          <h2>FIELDS (image pixels)</h2>
          <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <textarea readOnly spellCheck={false} value={code} />
        {importing ? (
          <>
            <textarea
              placeholder='{ "applicant.firstName": { "type": "text", "x": 410, "y": 620, "w": 900, "h": 70 } }'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <p className="warn">{importError}</p>
            <div className="row end">
              <button onClick={() => setImporting(false)}>Cancel</button>
              <button className="primary" onClick={runImport}>Import</button>
            </div>
          </>
        ) : (
          <button className="mt" onClick={() => setImporting(true)}>Import existing FIELDS</button>
        )}
      </section>
    </aside>
  );
}
