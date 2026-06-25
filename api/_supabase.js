export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function describeFetchError(error) {
  return error?.cause?.message || error?.message || 'fetch failed';
}

export async function supabaseFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: supabaseHeaders(options.headers),
    });
  } catch (error) {
    throw new Error(`Supabase request network failed: ${describeFetchError(error)}`);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || text || `Supabase error ${response.status}`);
  }
  return data;
}
