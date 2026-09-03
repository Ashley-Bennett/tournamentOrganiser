/**
 * Escape hatch for RPC parameters that accept NULL but cannot say so.
 *
 * A Postgres function parameter without a DEFAULT has no way to express
 * nullability, so `supabase gen types` marks it required and non-nullable even
 * where NULL is the normal, intended value:
 *
 *   - `p_device_token` is NULL for every account-linked player. That is the
 *     entire point of `assert_player_access` accepting either a device token
 *     or an account identity.
 *   - `p_pokemon1` / `p_pokemon2` are NULL until a player picks a deck.
 *   - the match-insight answers are NULL until someone fills them in.
 *
 * Giving those parameters `DEFAULT NULL` would fix the generated types, but
 * SQL requires defaults to be trailing and several of these sit mid-signature,
 * so the schema cannot be reshaped for the generator's benefit without
 * churning every call site.
 *
 * Use this ONLY where the SQL genuinely accepts NULL — never to silence a
 * parameter that is actually required. It is deliberately a named function
 * rather than a bare `as` so these spots stay greppable.
 */
export function nullableArg<T>(value: T | null | undefined): T {
  return value as T;
}
