const DEFAULT_LINE_CHANNEL_ID = '2010225094';

function bearerToken(request) {
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function lineFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || 'LINE authentication failed.');
    error.status = 401;
    throw error;
  }
  return data;
}

export async function requireLineUser(request) {
  const accessToken = bearerToken(request);
  if (!accessToken) {
    const error = new Error('Login with LINE again to sync cloud data.');
    error.status = 401;
    throw error;
  }

  const verification = await lineFetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`);
  const expectedChannelId = String(process.env.LINE_LOGIN_CHANNEL_ID || DEFAULT_LINE_CHANNEL_ID);
  if (String(verification.client_id) !== expectedChannelId) {
    const error = new Error('LINE access token belongs to a different app.');
    error.status = 401;
    throw error;
  }

  const profile = await lineFetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profile?.userId) {
    const error = new Error('LINE profile is unavailable.');
    error.status = 401;
    throw error;
  }
  return profile;
}

