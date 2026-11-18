// Helpers for the field list: sorting, naming, and converting to/from the FIELDS map.

export const sortFields = (fields) =>
  [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

export function uniqueName(taken, base) {
  const names = new Set(taken);
  let i = names.size + 1;
  let name;
  do name = `${base}${i++}`;
  while (names.has(name));
  return name;
}

// FIELDS map: { name: { type, page, x, y, w, h } }, coordinates from the top-left of the page.
export function toFieldsCode(fields, source) {
  const header = [];
  if (source) {
    header.push(
      source.units === "pt"
        ? `// ${source.name}: ${source.pages.length} page(s), units = PDF points from the top-left of each page`
        : `// ${source.name}: ${source.pages[0].width} x ${source.pages[0].height} px, coordinates from the top-left`
    );
    const existing = [...new Set(source.existing.map((e) => e.name))];
    if (existing.length) {
      header.push(`// Already in the PDF (kept as-is): ${existing.join(", ")}`);
    }
  }
  if (!fields.length) return [...header, "// Draw boxes on the page to generate the map"].join("\n");

  const sorted = sortFields(fields);
  const pad = Math.max(...sorted.map((f) => JSON.stringify(f.name).length)) + 2;
  const lines = sorted.map((f) => {
    const key = (JSON.stringify(f.name) + ":").padEnd(pad);
    const type = (JSON.stringify(f.type) + ",").padEnd(12);
    return `  ${key} { type: ${type} page: ${f.page}, x: ${f.x}, y: ${f.y}, w: ${f.w}, h: ${f.h} },`;
  });
  return [...header, `const FIELDS = {\n${lines.join("\n")}\n};`].join("\n");
}

// Accepts pasted JSON or the JS object printed by toFieldsCode.
export function parseFields(text, startId, pageCount = 1) {
  const json = text
    .trim()
    .replace(/^[\s\S]*?(const|let|var)\s+\w+\s*=\s*/, "") // strip "const FIELDS ="
    .replace(/\/\/.*$/gm, "") // line comments
    .replace(/;\s*$/, "")
    .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":') // quote bare keys
    .replace(/'/g, '"')
    .replace(/,\s*([}\]])/g, "$1"); // trailing commas

  const obj = JSON.parse(json);
  let id = startId;
  const fields = Object.entries(obj).map(([name, v]) => ({
    id: id++,
    name,
    type: v.type === "checkbox" ? "checkbox" : "text",
    page: Math.min(Math.max(0, +v.page || 0), pageCount - 1),
    x: +v.x || 0,
    y: +v.y || 0,
    w: +v.w || 50,
    h: +v.h || 20,
  }));
  if (!fields.length) throw new Error("No fields found");
  return fields;
}

export function validate(fields, existingNames = []) {
  const existing = new Set(existingNames);
  const seen = new Set();
  for (const f of fields) {
    if (!f.name) return "Every field needs a name.";
    if (existing.has(f.name)) return `"${f.name}" is already a field in this PDF.`;
    if (seen.has(f.name)) return `Duplicate name: ${f.name}`;
    seen.add(f.name);
  }
  return null;
}
