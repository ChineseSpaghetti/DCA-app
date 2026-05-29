const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'user_preferences';

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
    response.status(501).json({ error: 'Supabase is not configured.' });
    return;
  }

  const lineUserId = String(request.query.lineUserId || '').trim();
  if (!lineUserId) {
    response.status(400).json({ error: 'Missing lineUserId.' });
    return;
  }

  try {
    if (request.method === 'GET') {
      const rows = await supabaseFetch(`${TABLE}?line_user_id=eq.${encodeURIComponent(lineUserId)}&select=line_user_id,theme`);
      response.status(200).json({ preferences: rows[0] || null });
      return;
    }

    if (request.method === 'PUT') {
      const theme = request.body?.theme === 'dark' ? 'dark' : 'light';
      const rows = await supabaseFetch(TABLE, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ line_user_id: lineUserId, theme }),
      });
      response.status(200).json({ preferences: rows[0] });
      return;
    }

    response.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    response.status(500).json({ error: error.message || 'Preference API failed.' });
  }
}
