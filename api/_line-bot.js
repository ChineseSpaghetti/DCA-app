export function lineBotReady() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

function accessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

function describeFetchError(error) {
  return error?.cause?.message || error?.message || 'fetch failed';
}

async function fetchWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }
  throw new Error(`${label} network failed: ${describeFetchError(lastError)}`);
}

export async function downloadLineImage(messageId) {
  const response = await fetchWithRetry(
    `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
    { headers: { Authorization: `Bearer ${accessToken()}` } },
    'LINE image download',
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Could not download LINE image: ${response.status}${text ? ` ${text.slice(0, 180)}` : ''}`);
  }
  let contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) contentType = 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function replyLine(replyToken, messages) {
  if (!replyToken) return;
  const response = await fetchWithRetry('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: Array.isArray(messages) ? messages.slice(0, 5) : [messages],
    }),
  }, 'LINE reply');
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `LINE reply failed: ${response.status}`);
  }
}

export function textMessage(text) {
  return { type: 'text', text: String(text || '').slice(0, 5000) };
}

export function pendingConfirmMessage(pendingId, detail) {
  return {
    type: 'template',
    altText: 'Review extracted transaction',
    template: {
      type: 'buttons',
      title: 'Review transaction',
      text: String(detail || 'Save this extracted transaction?').slice(0, 160),
      actions: [
        { type: 'postback', label: 'Save', data: `save_pending:${pendingId}` },
        { type: 'postback', label: 'Cancel', data: `cancel_pending:${pendingId}` },
      ],
    },
  };
}
