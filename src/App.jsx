import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Stage from "./components/Stage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { parseFields, toFieldsCode, uniqueName, validate } from "./lib/fields.js";
import { loadSource, releaseSource } from "./lib/loadSource.js";
import { buildTemplate } from "./lib/buildPdf.js";

const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg";

export default function App() {
  const [source, setSource] = useState(null); // see lib/loadSource.js
  const [fields, setFields] = useState([]); // { id, name, type, page, x, y, w, h }
  const [selectedId, setSelectedId] = useState(null);
  const [newType, setNewType] = useState("text");
  const [zoom, setZoom] = useState("fit");
  const [wrapWidth, setWrapWidth] = useState(800);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const wrapRef = useRef(null);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const existing = source?.existing ?? [];
  const pageCount = source?.pages.length ?? 0;

  // Fit the widest page to the stage area. PDF pages are rendered at 2x, so they may zoom up to 200%.
  const maxWidth = source ? Math.max(...source.pages.map((p) => p.width)) : 1;
  const maxFit = source?.kind === "pdf" ? 2 : 1;
  const scale = zoom === "fit" ? Math.min(maxFit, (wrapWidth - 40) / maxWidth) : 1;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- field actions ----------
  const takenNames = () => [...fields.map((f) => f.name), ...existing.map((e) => e.name)];
  const addField = (page, rect) => {
    const f = {
      id: nextId.current++,
      name: uniqueName(takenNames(), newType === "checkbox" ? "checkbox" : "field"),
      type: newType,
      page,
      ...rect,
    };
    setFields((fs) => [...fs, f]);
    setSelectedId(f.id);
  };
  const updateField = (id, patch) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const deleteField = (id) => {
    setFields((fs) => fs.filter((f) => f.id !== id));
    setSelectedId(null);
  };
  const importFields = (text) => {
    const parsed = parseFields(text, nextId.current, Math.max(1, pageCount));
    nextId.current += parsed.length;
    setFields(parsed);
    setSelectedId(null);
  };

  // ---------- keyboard: delete, nudge, deselect ----------
  useEffect(() => {
    function onKey(e) {
      if (!selected || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      const moves = {
        ArrowLeft: ["x", -step], ArrowRight: ["x", step],
        ArrowUp: ["y", -step], ArrowDown: ["y", step],
      };
      if (e.key === "Delete" || e.key === "Backspace") deleteField(selected.id);
      else if (moves[e.key]) {
        const [k, d] = moves[e.key];
        updateField(selected.id, { [k]: Math.max(0, selected[k] + d) });
      } else if (e.key === "Escape") setSelectedId(null);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // ---------- loading a PDF or image ----------
  async function openFile(file) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const next = await loadSource(file);
      releaseSource(source);
      setSource(next);
      setSelectedId(null);
      // Keep fields only if they still fit (e.g. reopening an updated version of the same form)
      setFields((fs) => fs.filter((f) => f.page < next.pages.length));
      if (next.hasXfa) setError("This PDF contains an XFA form. pdf-lib may not fill it reliably.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------- download template.pdf ----------
  async function downloadPdf() {
    const problem = validate(fields, existing.map((e) => e.name));
    if (problem) return setError(problem);
    setError("");
    try {
      const pdfBytes = await buildTemplate(source, fields);
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const base = source.name.replace(/\.[^.]+$/, "");
      const a = Object.assign(document.createElement("a"), { href: url, download: `${base}-template.pdf` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(`Could not build the PDF: ${err.message}`);
    }
  }

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        openFile(e.dataTransfer.files[0]);
      }}
    >
      <header>
        <h1>PDF Field Mapper</h1>
        <label className="btn">
          Open PDF or image
          <input type="file" accept={ACCEPT} hidden onChange={(e) => openFile(e.target.files[0])} />
        </label>
        <Seg value={newType} onChange={setNewType} options={[["text", "Text"], ["checkbox", "Checkbox"]]} />
        <Seg value={zoom} onChange={setZoom} options={[["fit", "Fit"], ["100", "100%"]]} />
        <button className="primary" disabled={!source || !fields.length} onClick={downloadPdf}>
          Download template.pdf
        </button>
        {loading && <span className="muted">Rendering pages…</span>}
        {error && <span className="warn">{error}</span>}
        <span className="muted hint">Drag to draw · drag to move · corner to resize · Delete removes · arrows nudge</span>
      </header>

      <main>
        <div className="stage-wrap" ref={wrapRef}>
          {source ? (
            source.pages.map((page, i) => (
              <Stage
                key={`${source.name}-${i}`}
                page={page}
                pageNumber={i + 1}
                pageCount={pageCount}
                scale={scale}
                fields={fields.filter((f) => f.page === i)}
                existing={existing.filter((f) => f.page === i)}
                selectedId={selectedId}
                onAdd={(rect) => addField(i, rect)}
                onChange={updateField}
                onSelect={setSelectedId}
              />
            ))
          ) : (
            <div className="drop">
              <strong>Drop a PDF or a scanned form here</strong>
              PDF, PNG or JPG. Draw a box over each blank, name it, then download the fillable template.
            </div>
          )}
        </div>

        <Sidebar
          fields={fields}
          existing={existing}
          pageCount={pageCount}
          selected={selected}
          code={toFieldsCode(fields, source)}
          onSelect={(id) => {
            setSelectedId(id);
            document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
          onChange={updateField}
          onDelete={deleteField}
          onImport={importFields}
        />
      </main>
    </div>
  );
}

function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
