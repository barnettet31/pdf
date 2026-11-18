import { PDFDocument, degrees } from "pdf-lib";

// Builds template.pdf with your named fields.
//  - PDF source: the fields are added to the original PDF (text stays real text,
//    fields already in it are kept as they are).
//  - Image source: the image becomes the page background, as in make-template.mjs.
export async function buildTemplate(source, fields) {
  return source.kind === "pdf" ? addToPdf(source, fields) : fromImage(source, fields);
}

const FIELD_STYLE = {
  backgroundColor: undefined, // transparent so the page shows through
  borderColor: undefined,
  borderWidth: 0, // keeps the field exactly where you drew it
};

// pdf-lib rotates the rectangle you pass by the `rotate` angle, so for rotated pages
// give it the anchor and size that rotate back onto the rectangle we want.
function rotatedPlacement(r, angle) {
  switch (((angle % 360) + 360) % 360) {
    case 90:  return { x: r.x + r.width, y: r.y,            width: r.height, height: r.width };
    case 180: return { x: r.x + r.width, y: r.y + r.height, width: r.width,  height: r.height };
    case 270: return { x: r.x,           y: r.y + r.height, width: r.height, height: r.width };
    default:  return r;
  }
}

function createField(form, f) {
  return f.type === "checkbox" ? form.createCheckBox(f.name) : form.createTextField(f.name);
}

async function addToPdf(source, fields) {
  const pdf = await PDFDocument.load(source.bytes);
  const pages = pdf.getPages();
  const form = pdf.getForm();

  for (const f of fields) {
    const info = source.pages[f.page];
    // Convert top-left page coordinates to PDF coordinates (bottom-left origin,
    // crop box offset and page rotation included).
    const [ax, ay] = info.viewport.convertToPdfPoint(f.x, f.y);
    const [bx, by] = info.viewport.convertToPdfPoint(f.x + f.w, f.y + f.h);

    const rect = {
      x: Math.min(ax, bx),
      y: Math.min(ay, by),
      width: Math.abs(bx - ax),
      height: Math.abs(by - ay),
    };
    const angle = info.rotation || 0;
    createField(form, f).addToPage(pages[f.page], {
      ...rotatedPlacement(rect, angle),
      rotate: degrees(angle), // keeps the text upright on rotated pages
      ...FIELD_STYLE,
    });
  }
  return pdf.save();
}

async function fromImage(source, fields, pageWidth = 612) {
  const pdf = await PDFDocument.create();
  const image =
    source.mime === "image/png" ? await pdf.embedPng(source.bytes) : await pdf.embedJpg(source.bytes);

  const s = pageWidth / image.width; // image pixels -> PDF points
  const page = pdf.addPage([pageWidth, image.height * s]);
  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: image.height * s });

  const form = pdf.getForm();
  for (const f of fields) {
    createField(form, f).addToPage(page, {
      x: f.x * s,
      y: page.getHeight() - (f.y + f.h) * s, // PDF origin is bottom-left
      width: f.w * s,
      height: f.h * s,
      ...FIELD_STYLE,
    });
  }
  return pdf.save();
}
