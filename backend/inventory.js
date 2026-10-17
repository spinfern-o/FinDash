/* The account's physical-stock ledger. Only confirmed text and counts are
   saved; invoice images stay out of this table. RLS uses the owner's token.
   PUT requires the revision last read, so two tabs cannot erase each other. */

import { accountsAreSetUp, supabaseClient } from "../lib/supabase.js";
import { currentSession, isSameSite } from "../lib/session.js";
import { emptyInventory, validateInventory } from "../frontend/js/stock/ledger.js";

const TABLE = "account_inventory";
const MAXIMUM_BYTES = 1_000_000;

/* Storage errors reveal setup or availability, never the owner's records. */
function storageFailed(res, error) {
  console.error("[findash-error] inventory:", error.code || "storage failure");
  if (error.code === "42P01" || error.code === "PGRST205") {
    return res.status(503).json({ error: "Inventory saving isn't set up on this site yet." });
  }
  return res.status(502).json({ error: "Inventory could not be saved or loaded right now." });
}

/* Read only this owner's row, using the database's row-level policies. */
async function loadInventory(client, res) {
  const { data, error } = await client.from(TABLE).select("inventory, revision").maybeSingle();
  if (error) {
    return storageFailed(res, error);
  }
  if (!data) {
    return res.status(200).json({ inventory: emptyInventory(), revision: 0 });
  }
  try {
    validateInventory(data.inventory);
  } catch {
    return res.status(502).json({ error: "Saved inventory could not be read. Your saved record has not been changed." });
  }
  return res.status(200).json({ inventory: data.inventory, revision: data.revision });
}

/* Compare-and-swap in one database write; never load then blindly overwrite. */
async function saveInventory(client, user, body, res) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ error: "Supply the inventory revision last read." });
  }
  try {
    validateInventory(body.inventory);
    if (Buffer.byteLength(JSON.stringify(body.inventory), "utf8") > MAXIMUM_BYTES) {
      throw new Error("Inventory is too large to save.");
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const row = {
    user_id: user.id,
    inventory: body.inventory,
    revision: body.revision + 1,
    updated_at: new Date().toISOString()
  };
  let query;
  if (body.revision === 0) {
    query = client.from(TABLE).insert(row);
  } else {
    query = client.from(TABLE).update(row).eq("user_id", user.id).eq("revision", body.revision);
  }
  const { data, error } = await query.select("revision").maybeSingle();
  if (error && error.code !== "23505") {
    return storageFailed(res, error);
  }
  if (error || !data) {
    return res.status(409).json({ error: "Inventory changed in another tab. Reload before saving again.", conflict: true });
  }
  return res.status(200).json({ revision: data.revision });
}

/* Authenticate every read and reject cross-site writes before touching data. */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "GET or PUT only" });
  }
  if (req.method === "PUT" && !isSameSite(req)) {
    return res.status(403).json({ error: "request from another site" });
  }
  if (!accountsAreSetUp()) {
    return res.status(503).json({ error: "Accounts aren't set up on this site yet." });
  }
  const session = await currentSession(req, res);
  if (!session) {
    return res.status(401).json({ error: "Log in to save inventory to your account." });
  }
  // Another tab can switch accounts while this page still holds the old
  // owner's records. Bind reads and writes to the owner this page loaded.
  const expectedOwner = req.headers["x-findash-owner"];
  if (req.method === "PUT" && expectedOwner === undefined) {
    return res.status(400).json({ error: "Supply the account owner loaded by this page." });
  }
  if (expectedOwner !== undefined && (typeof expectedOwner !== "string" ||
      expectedOwner.toLowerCase() !== String(session.user.email).toLowerCase())) {
    return res.status(401).json({ error: "The signed-in account changed. Export your work before reloading." });
  }
  const client = supabaseClient(session.accessToken);
  if (req.method === "GET") {
    return loadInventory(client, res);
  }
  return saveInventory(client, session.user, req.body || {}, res);
}
