import type { CardData } from "./types";

/** Escape a value for CSV (RFC 4180) */
function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Parse a CSV string into rows of string arrays (RFC 4180) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const row: string[] = [];
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
        i++;
        let value = "";
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
        row.push(value);
      } else {
        // Unquoted field
        let value = "";
        while (i < text.length && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          value += text[i];
          i++;
        }
        row.push(value);
      }
      if (i < text.length && text[i] === ",") {
        i++;
      } else {
        break;
      }
    }
    // Skip line endings
    if (i < text.length && text[i] === "\r") i++;
    if (i < text.length && text[i] === "\n") i++;
    rows.push(row);
  }
  return rows;
}

/** Export cards to a CSV string. Columns: collection (if present), name, then all field keys sorted. */
export function cardsToCSV(cards: (CardData & { collectionId?: string; collectionName?: string })[]): string {
  const hasCollections = cards.some(c => c.collectionId || c.collectionName);
  const fieldKeys = new Set<string>();
  for (const card of cards) {
    for (const key of Object.keys(card.fields)) fieldKeys.add(key);
  }
  const sortedKeys = [...fieldKeys].sort();
  const header = [...(hasCollections ? ["collection"] : []), "name", ...sortedKeys].map(escapeCsv).join(",");
  const rows = cards.map((card) =>
    [...(hasCollections ? [card.collectionName || card.collectionId || ""] : []), card.name, ...sortedKeys.map((k) => card.fields[k] ?? "")]
      .map(escapeCsv)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

/** Import cards from a CSV string. Must have a "name" column. Optional "collection" column. Rest are field keys. */
export function csvToCards(csv: string): (Omit<CardData, "id"> & { collectionName?: string })[] {
  const rows = parseCsv(csv.trim());
  if (rows.length < 2) return [];
  const [header, ...dataRows] = rows;
  const nameIdx = header.findIndex((h) => h.toLowerCase() === "name");
  if (nameIdx === -1) throw new Error('CSV must have a "name" column');
  const colIdx = header.findIndex((h) => h.toLowerCase() === "collection");
  const skipIndices = new Set([nameIdx, ...(colIdx >= 0 ? [colIdx] : [])]);
  const fieldKeys = header.filter((_, i) => !skipIndices.has(i));
  const fieldIndices = header.map((_, i) => i).filter((i) => !skipIndices.has(i));

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const fields: Record<string, string> = {};
      for (let j = 0; j < fieldKeys.length; j++) {
        const val = row[fieldIndices[j]] ?? "";
        if (val !== "") fields[fieldKeys[j]] = val;
      }
      return {
        name: row[nameIdx] || "Untitled",
        fields,
        ...(colIdx >= 0 && row[colIdx] ? { collectionName: row[colIdx] } : {}),
      };
    });
}
