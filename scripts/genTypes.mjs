#!/usr/bin/env node
/**
 * Generate frontend/src/types/database.ts from the local Supabase stack.
 *
 * Why not `supabase gen types typescript --local`
 * ----------------------------------------------
 * That command's output depends on which postgres-meta image the CLI happens
 * to use, and that is not under our control: a long-running local stack keeps
 * whatever image it was first started with, while CI starts fresh and gets
 * whatever the newest CLI pins. Two versions format the same schema
 * differently (`Args: never` vs `Record<PropertyKey, never>`, parenthesised
 * generics), so CI's "are the generated files current" check failed on
 * formatting alone, with no way to reproduce its output locally.
 *
 * Running one pinned image directly makes the output a function of the schema
 * only. CI runs this same script, so matching it locally is exact.
 *
 * To upgrade the generator, bump PG_META_IMAGE, rerun, and commit the
 * formatting churn on its own.
 *
 * Usage: node scripts/genTypes.mjs   (with the local Supabase stack up)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PG_META_IMAGE = "ghcr.io/supabase/postgres-meta:v0.99.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "frontend", "src", "types", "database.ts");

// The stack's containers and network are named after config.toml's project_id.
const config = fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) {
  console.error("Could not read project_id from supabase/config.toml");
  process.exit(1);
}

const types = execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    `supabase_network_${projectId}`,
    "-e",
    `PG_META_DB_URL=postgresql://postgres:postgres@supabase_db_${projectId}:5432/postgres`,
    "-e",
    "PG_META_GENERATE_TYPES=typescript",
    "-e",
    "PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public,graphql_public",
    "-e",
    "PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true",
    PG_META_IMAGE,
    "node",
    "dist/server/server.js",
  ],
  // The generator logs pool warnings to stderr; only stdout is the file.
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
);

fs.writeFileSync(OUT_FILE, types);
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} using ${PG_META_IMAGE}`);
