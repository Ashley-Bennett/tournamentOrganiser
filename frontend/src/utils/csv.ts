// CSV export for the stats tables.
//
// The stats pages are partly a way of reading the database, so anything shown
// in a table should be removable to a spreadsheet rather than retyped.

/**
 * Quote one CSV field.
 *
 * Values beginning with =, +, - or @ are prefixed with an apostrophe: a
 * spreadsheet treats those as the start of a formula, so a player who names
 * themselves `=cmd|...` would otherwise have that evaluated when the organiser
 * opens the file. Player names and deck labels are user-supplied, so this is a
 * real path, not a hypothetical one.
 */
function escapeField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) lines.push(row.map(escapeField).join(","));
  // CRLF and a UTF-8 BOM keep Excel happy with both line endings and accents
  // (Pokémon, and any player with a non-ASCII name).
  return "﻿" + lines.join("\r\n");
}

/** Trigger a download of `content` as `filename` in the browser. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename-safe slug, e.g. "My Workspace" → "my-workspace". */
export function slugForFile(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p && p.trim() !== "")
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
