export function lineBotReady() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

function accessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

export async function downloadLineImage(messageId) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!response.ok) throw new Error(`Could not download LINE image: ${response.status}`);
  let contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) contentType = 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function replyLine(replyToken, messages) {
  if (!replyToken) return;
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: Array.isArray(messages) ? messages.slice(0, 5) : [messages],
    }),
  });
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
