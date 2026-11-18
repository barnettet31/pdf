import { useRef, useState } from "react";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v * 10) / 10;
const rectFrom = (a, b) => ({
  x: round(Math.min(a.x, b.x)),
  y: round(Math.min(a.y, b.y)),
  w: round(Math.abs(b.x - a.x)),
  h: round(Math.abs(b.y - a.y)),
});

// One page with field boxes over it. Field coordinates are in page units
// (pixels for an image, points for a PDF); `scale` only affects how they are drawn.
export default function Stage({ page, pageNumber, pageCount, scale, fields, existing, selectedId, onAdd, onChange, onSelect }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [ghost, setGhost] = useState(null);

  const toPage = (e) => {
    const r = ref.current.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / scale, 0, page.width),
      y: clamp((e.clientY - r.top) / scale, 0, page.height),
    };
  };

  function handlePointerDown(e) {
    if (e.button !== 0) return;
    const p = toPage(e);
    const boxEl = e.target.closest("[data-id]");

    if (boxEl) {
      const f = fields.find((f) => f.id === Number(boxEl.dataset.id));
      onSelect(f.id);
      drag.current = { mode: e.target.dataset.handle ? "resize" : "move", start: p, orig: { ...f } };
    } else {
      onSelect(null);
      drag.current = { mode: "draw", start: p };
      setGhost(rectFrom(p, p));
    }
    ref.current.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const p = toPage(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const o = d.orig;

    if (d.mode === "draw") setGhost(rectFrom(d.start, p));
    else if (d.mode === "move")
      onChange(o.id, {
        x: round(clamp(o.x + dx, 0, page.width - o.w)),
        y: round(clamp(o.y + dy, 0, page.height - o.h)),
      });
    else
      onChange(o.id, {
        w: round(clamp(o.w + dx, 2, page.width - o.x)),
        h: round(clamp(o.h + dy, 2, page.height - o.y)),
      });
  }

  function handlePointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (d?.mode !== "draw") return;
    const r = rectFrom(d.start, toPage(e));
    setGhost(null);
    if (r.w * scale > 4 && r.h * scale > 4) onAdd(r);
  }

  const px = (r) => ({
    left: r.x * scale,
    top: r.y * scale,
    width: r.w * scale,
    height: r.h * scale,
  });

  return (
    <div className="page-block">
      {pageCount > 1 && <div className="page-label">Page {pageNumber}</div>}
      <div
        ref={ref}
        className="stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={page.src}
          alt={`Page ${pageNumber}`}
          draggable={false}
          style={{ width: page.width * scale, height: page.height * scale }}
        />
        {existing.map((f, i) => (
          <div key={`e${i}`} className="box existing" style={px(f)} title={`${f.name} (${f.type}, already in the PDF)`}>
            <span className="lbl">🔒 {f.name}</span>
          </div>
        ))}
        {fields.map((f) => (
          <div
            key={f.id}
            data-id={f.id}
            className={`box ${f.type}${f.id === selectedId ? " sel" : ""}`}
            style={px(f)}
          >
            <span className="lbl">{f.name || "(unnamed)"}</span>
            <span className="handle" data-handle="1" />
          </div>
        ))}
        {ghost && <div className="ghost" style={px(ghost)} />}
      </div>
    </div>
  );
}
