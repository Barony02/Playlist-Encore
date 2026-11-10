import { AppError } from "../errors.js";

export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Aceita o CSV do Exportify (colunas "Track Name" e "Artist Name(s)") e CSVs parecidos.
export function itemsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new AppError(400, "O CSV está vazio.");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => /^(track name|name|title|song)$/.test(h));
  const artistIdx = header.findIndex((h) => h.includes("artist"));

  if (titleIdx < 0) {
    throw new AppError(
      400,
      'Não encontrei a coluna com o nome da música. Use um CSV com a coluna "Track Name" (como o do Exportify).'
    );
  }

  const items = rows
    .slice(1)
    .filter((r) => r[titleIdx]?.trim())
    .map((r) => ({
      title: r[titleIdx].trim(),
      artist: artistIdx >= 0 ? (r[artistIdx] || "").split(";").map((a) => a.trim()).filter(Boolean).join(", ") : "",
    }));

  return { name: null, items };
}
