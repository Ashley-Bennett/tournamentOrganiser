#!/usr/bin/env node
/**
 * Write the current definition of every function in `public` to
 * supabase/functions_current/, one file each.
 *
 * Why this exists
 * ---------------
 * Functions are only ever defined as `CREATE OR REPLACE` statements inside
 * migrations, and the busy ones have been replaced many times over — 12 for
 * get_player_tournament_view, 7 each for submit_match_result and
 * self_join_tournament. To know what one of them does today you have to replay
 * its migration history in order and hope you found the last one.
 *
 * That is not a theoretical cost. The audit trigger kept copying device tokens
 * into audit_log for six months partly because nobody could see its current
 * body next to the column grants that were supposed to protect them.
 *
 * Migrations stay the source of truth for *how the schema got here*. These
 * files are the source of truth for *what it is now*: greppable, diffable in
 * review, and regenerated rather than hand-maintained.
 *
 * Usage: node scripts/dumpFunctions.mjs   (with the local Supabase stack up)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "supabase", "functions_current");
const CONN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Run a query against the local stack.
 *
 * Prefers a real psql (CI runners have one); falls back to the one inside the
 * Supabase Docker container, which is how it runs on a Windows dev machine
 * where psql is not on PATH.
 */
function query(sql) {
  const args = ["-Atc", sql, CONN];
  try {
    return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 64 << 20 });
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const container = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .split("\n")
    .find((n) => n.startsWith("supabase_db_"));
  if (!container) {
    throw new Error(
      "No psql on PATH and no supabase_db_* container running. Start the local stack with `npx supabase start`.",
    );
  }
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  );
}

// A single record separator that cannot occur in SQL text.
const SEP = "";

const rows = query(`
  SELECT p.proname
      || '${SEP}' || md5(pg_get_function_identity_arguments(p.oid))
      || '${SEP}' || replace(pg_get_functiondef(p.oid), E'\\n', '')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
   ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
`)
  .split("\n")
  .filter((l) => l.trim() !== "");

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// Overloads share a name, so a short hash of the argument list disambiguates
// the second and later ones rather than silently overwriting the first.
const seen = new Map();
let written = 0;

for (const row of rows) {
  const [name, argHash, body] = row.split(SEP);
  const count = (seen.get(name) ?? 0) + 1;
  seen.set(name, count);
  const file = count === 1 ? `${name}.sql` : `${name}.${argHash.slice(0, 8)}.sql`;
  const sql = body.replaceAll("", "\n").trimEnd();
  fs.writeFileSync(path.join(OUT_DIR, file), sql + "\n", "utf8");
  written += 1;
}

const overloaded = [...seen.entries()].filter(([, n]) => n > 1);
console.log(`Wrote ${written} function definitions to supabase/functions_current/`);
if (overloaded.length > 0) {
  console.log(
    `Overloaded: ${overloaded.map(([n, c]) => `${n} (${c})`).join(", ")}`,
  );
}
