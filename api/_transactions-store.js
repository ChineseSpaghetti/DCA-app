import { createHash } from 'node:crypto';
import { supabaseFetch } from './_supabase.js';

export const TRANSACTIONS_TABLE = 'transactions';
export const PENDING_TABLE = 'line_pending_transactions';

export function uuid(value) {
  const clean = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean) ? clean : undefined;
}

export function deterministicUuid(value) {
  const hex = createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function cleanTransaction(lineUserId, input) {
  const shares = Number(input.shares) || 0;
  const price = Number(input.price) || 0;
  return {
    client_id: uuid(input.clientId || input.id),
    line_user_id: lineUserId,
    symbol: String(input.symbol || '').trim().toUpperCase(),
    side: input.side === 'sell' ? 'sell' : 'buy',
    currency: input.currency === 'USD' ? 'USD' : 'THB',
    date: input.date || new Date().toISOString().slice(0, 10),
    shares,
    price,
    stock_value: Number(input.stockValue) || shares * price,
    fee: Number(input.fee) || 0,
  };
}

export function fromDb(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    currency: row.currency,
    date: row.date,
    shares: Number(row.shares) || 0,
    price: Number(row.price) || 0,
    stockValue: Number(row.stock_value) || 0,
    fee: Number(row.fee) || 0,
    createdAt: row.created_at,
    clientId: row.client_id,
    cloudSynced: true,
  };
}

function withoutClientId(tx) {
  const { client_id, ...legacyTx } = tx;
  return legacyTx;
}

function isLegacySchemaError(error) {
  return /client_id|on conflict|unique or exclusion constraint/i.test(error.message || '');
}

export function transactionIsValid(input) {
  return Boolean(String(input.symbol || '').trim() && Number(input.shares) > 0 && Number(input.price) > 0 && input.date);
}

export async function listTransactions(lineUserId) {
  const rows = await supabaseFetch(`${TRANSACTIONS_TABLE}?line_user_id=eq.${encodeURIComponent(lineUserId)}&order=date.desc,created_at.desc&select=*`);
  return rows.map(fromDb);
}

export async function saveTransaction(lineUserId, input) {
  const tx = cleanTransaction(lineUserId, input);
  if (!tx.symbol || !tx.shares || !tx.price) {
    const error = new Error('Symbol, shares, and price are required.');
    error.status = 400;
    throw error;
  }
  let rows;
  try {
    rows = await supabaseFetch(`${TRANSACTIONS_TABLE}?on_conflict=line_user_id,client_id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(tx),
    });
  } catch (error) {
    if (!isLegacySchemaError(error)) throw error;
    rows = await supabaseFetch(TRANSACTIONS_TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(withoutClientId(tx)),
    });
  }
  return fromDb(rows[0]);
}

export async function updateTransaction(lineUserId, id, input) {
  const tx = cleanTransaction(lineUserId, input);
  if (!tx.symbol || !tx.shares || !tx.price) {
    const error = new Error('Symbol, shares, and price are required.');
    error.status = 400;
    throw error;
  }
  const path = `${TRANSACTIONS_TABLE}?id=eq.${encodeURIComponent(id)}&line_user_id=eq.${encodeURIComponent(lineUserId)}`;
  let rows;
  try {
    rows = await supabaseFetch(path, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(tx),
    });
  } catch (error) {
    if (!isLegacySchemaError(error)) throw error;
    rows = await supabaseFetch(path, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(withoutClientId(tx)),
    });
  }
  if (!rows[0]) {
    const error = new Error('Transaction not found.');
    error.status = 404;
    throw error;
  }
  return fromDb(rows[0]);
}

export async function deleteTransaction(lineUserId, id) {
  await supabaseFetch(`${TRANSACTIONS_TABLE}?id=eq.${encodeURIComponent(id)}&line_user_id=eq.${encodeURIComponent(lineUserId)}`, {
    method: 'DELETE',
  });
  return true;
}

export async function savePendingTransaction(lineUserId, draft) {
  const id = uuid(draft.id) || deterministicUuid(`${lineUserId}:${draft.clientId || draft.messageId || Date.now()}`);
  const row = {
    id,
    line_user_id: lineUserId,
    client_id: uuid(draft.clientId),
    payload: draft.payload || draft,
    confidence: Number(draft.confidence) || 0,
    date_confidence: Number(draft.dateConfidence) || 0,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  const rows = await supabaseFetch(`${PENDING_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  return rows[0];
}

export async function getPendingTransaction(lineUserId, id) {
  const rows = await supabaseFetch(`${PENDING_TABLE}?id=eq.${encodeURIComponent(id)}&line_user_id=eq.${encodeURIComponent(lineUserId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`);
  return rows[0] || null;
}

export async function deletePendingTransaction(lineUserId, id) {
  await supabaseFetch(`${PENDING_TABLE}?id=eq.${encodeURIComponent(id)}&line_user_id=eq.${encodeURIComponent(lineUserId)}`, {
    method: 'DELETE',
  });
}
