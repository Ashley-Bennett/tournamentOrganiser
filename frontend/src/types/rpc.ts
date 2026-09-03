import type { Database } from "./database";

/**
 * Helpers for reaching into the generated schema.
 *
 * These live here rather than in `database.ts` because that file is generated
 * and CI overwrites it — anything hand-written there would be lost on the next
 * regeneration.
 */

/** Every function the database exposes. */
export type RpcName = keyof Database["public"]["Functions"];

/** The argument object a given RPC expects. */
export type RpcArgs<F extends RpcName> =
  Database["public"]["Functions"][F]["Args"];

/**
 * One row of a set-returning RPC's result.
 *
 * Prefer this over hand-writing an interface for a result shape. A typed
 * client checks the arguments you send and the tables you read, but `data as
 * MyRow[]` is still only an assertion: TypeScript permits it because the cast
 * narrows, so a renamed or retyped column in SQL goes unnoticed until it
 * breaks at runtime. Deriving the row from the schema closes that last gap.
 */
export type RpcRow<F extends RpcName> =
  Database["public"]["Functions"][F]["Returns"] extends readonly (infer R)[]
    ? R
    : Database["public"]["Functions"][F]["Returns"];
