/* Connecting to Supabase from the serverless functions.

   Only the project address and the public (anon / publishable) key are
   used: every call is one the logged-in person could make themselves, and
   the database's row-level security decides what they may see. The
   service-role key is never needed and never read. */

import { createClient } from "@supabase/supabase-js";

// The Supabase integration on Vercel has used several names over time; take
// whichever the project has.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function accountsAreSetUp() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/* A fresh client for every request, holding nothing between them: one
   serverless instance can serve many people, and one person's session must
   never leak into another's request.

   With an access token, database requests are made as that person, so the
   database only lets them reach their own rows. */
export function supabaseClient(accessToken) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  };
  if (accessToken) {
    options.global = { headers: { Authorization: `Bearer ${accessToken}` } };
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, options);
}
