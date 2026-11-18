import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const RENDER_SCALE = 2; // render PDF pages at 2x so they stay sharp when zoomed

// A "source" is what you draw on. Every page has a width/height in its own units:
//   image -> pixels, one page
//   pdf   -> PDF points (1/72 in), measured from the top-left of the page as displayed
// Field coordinates are always in those units, from the top-left of their page.
export async function loadSource(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return loadPdf(bytes, file.name);
  if (/^image\/(png|jpeg)$/.test(file.type)) return loadImage(bytes, file);
  throw new Error("Use a PDF, PNG or JPG.");
}

export function releaseSource(source) {
  source?.pages.forEach((p) => URL.revokeObjectURL(p.src));
}

async function loadImage(bytes, file) {
  const src = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not read that image."));
    i.src = src;
  });
  return {
    kind: "image",
    name: file.name,
    bytes,
    mime: file.type,
    units: "px",
    pages: [{ src, width: img.naturalWidth, height: img.naturalHeight }],
    existing: [],
  };
}

async function loadPdf(bytes, name) {
  let doc;
  let loadingTask
  try {
    // pdf.js takes ownership of the buffer it is given, so pass a copy
    loadingTask =  pdfjs.getDocument({ data: bytes.slice() });
    doc = await loadingTask.promise;
  } catch (err) {
    if (err?.name === "PasswordException") throw new Error("This PDF is password-protected. Remove the password first.");
    throw new Error(`Could not open that PDF: ${err.message}`);
  }

  const pages = [];
  const existing = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 }); // 1 unit = 1 PDF point
    const renderViewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    await page.render({ canvas, viewport: renderViewport }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));

    pages.push({
      src: URL.createObjectURL(blob),
      width: viewport.width,
      height: viewport.height,
      rotation: page.rotate,
      viewport, // converts between page coordinates and PDF coordinates (handles crop box + rotation)
    });

    // Fields that are already in the PDF, shown as locked boxes
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== "Widget" || !a.fieldName) continue;
      existing.push({
        name: a.fieldName,
        type: widgetType(a),
        page: i - 1,
        ...rectFromPdf(viewport, a.rect),
      });
    }
  }

  const hasXfa = doc.isPureXfa || (await doc.getMetadata()).info?.IsXFAPresent;
  await loadingTask.destroy();
  return { kind: "pdf", name, bytes, units: "pt", pages, existing, hasXfa: Boolean(hasXfa) };
}

function widgetType(a) {
  if (a.fieldType === "Tx") return "text";
  if (a.fieldType === "Btn") return a.checkBox ? "checkbox" : a.radioButton ? "radio" : "button";
  if (a.fieldType === "Ch") return "dropdown";
  if (a.fieldType === "Sig") return "signature";
  return "other";
}

// PDF rect [x1, y1, x2, y2] (bottom-left origin) -> top-left {x, y, w, h} on the displayed page
function rectFromPdf(viewport, [x1, y1, x2, y2]) {
  const [ax, ay] = viewport.convertToViewportPoint(x1, y1);
  const [bx, by] = viewport.convertToViewportPoint(x2, y2);
  return {
    x: round(Math.min(ax, bx)),
    y: round(Math.min(ay, by)),
    w: round(Math.abs(bx - ax)),
    h: round(Math.abs(by - ay)),
  };
}

const round = (v) => Math.round(v * 10) / 10;
