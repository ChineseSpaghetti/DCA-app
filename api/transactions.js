const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'transactions';

function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function cleanTransaction(lineUserId, input) {
  return {
    line_user_id: lineUserId,
    symbol: String(input.symbol || '').trim().toUpperCase(),
    side: input.side === 'sell' ? 'sell' : 'buy',
    currency: input.currency === 'USD' ? 'USD' : 'THB',
    date: input.date || new Date().toISOString().slice(0, 10),
    shares: Number(input.shares) || 0,
    price: Number(input.price) || 0,
    stock_value: Number(input.stockValue) || 0,
    fee: Number(input.fee) || 0,
  };
}

function fromDb(row) {
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
  };
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || text || `Supabase error ${response.status}`);
  }
  return data;
}

export default async function handler(request, response) {
  if (!supabaseReady()) {
    response.status(501).json({ error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.' });
    return;
  }

  const lineUserId = String(request.query.lineUserId || '').trim();
  if (!lineUserId) {
    response.status(400).json({ error: 'Missing lineUserId.' });
    return;
  }

  try {
    if (request.method === 'GET') {
      const rows = await supabaseFetch(`${TABLE}?line_user_id=eq.${encodeURIComponent(lineUserId)}&order=date.desc,created_at.desc&select=*`);
      response.status(200).json({ transactions: rows.map(fromDb) });
      return;
    }

    if (request.method === 'POST') {
      const tx = cleanTransaction(lineUserId, request.body || {});
      if (!tx.symbol || !tx.shares || !tx.price) {
        response.status(400).json({ error: 'Symbol, shares, and price are required.' });
        return;
      }
      const rows = await supabaseFetch(TABLE, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(tx),
      });
      response.status(200).json({ transaction: fromDb(rows[0]) });
      return;
    }

    if (request.method === 'DELETE') {
      const id = String(request.query.id || '').trim();
      if (!id) {
        response.status(400).json({ error: 'Missing transaction id.' });
        return;
      }
      await supabaseFetch(`${TABLE}?id=eq.${encodeURIComponent(id)}&line_user_id=eq.${encodeURIComponent(lineUserId)}`, {
        method: 'DELETE',
      });
      response.status(200).json({ ok: true });
      return;
    }

    response.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    response.status(500).json({ error: error.message || 'Transaction API failed.' });
  }
}
