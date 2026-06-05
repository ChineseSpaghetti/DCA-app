import { createHmac, timingSafeEqual } from 'node:crypto';
import { classifyPortfolioQuestion, extractTransactionFromImage, polishPortfolioAnswer } from './_gemini-extract.js';
import { lineBotReady, downloadLineImage, pendingConfirmMessage, replyLine, textMessage } from './_line-bot.js';
import { buildPortfolio, answerPortfolioQuestion, formatTransaction, portfolioHelpMessage } from './_portfolio.js';
import { supabaseReady } from './_supabase.js';
import {
  deletePendingTransaction,
  deterministicUuid,
  getPendingTransaction,
  listTransactions,
  savePendingTransaction,
  saveTransaction,
  transactionIsValid,
} from './_transactions-store.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function verifyLineSignature(rawBody, signature) {
  const value = Array.isArray(signature) ? signature[0] : signature;
  if (!process.env.LINE_CHANNEL_SECRET || !value) return false;
  const expected = createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(rawBody).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(value);
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function withClientId(parsed, messageId) {
  return {
    ...parsed,
    clientId: deterministicUuid(`line-message:${messageId}`),
    stockValue: Number(parsed.stockValue) || (Number(parsed.shares) || 0) * (Number(parsed.price) || 0),
    fee: Number(parsed.fee) || (Number(parsed.commission) || 0) + (Number(parsed.vat) || 0),
  };
}

function shouldAutoSave(tx) {
  return transactionIsValid(tx) && Number(tx.confidence) >= 0.85 && Number(tx.dateConfidence) >= 0.8;
}

function shortTxDetail(tx) {
  const confidence = Math.round((Number(tx.confidence) || 0) * 100);
  const dateConfidence = Math.round((Number(tx.dateConfidence) || 0) * 100);
  return [
    `${String(tx.side || 'buy').toUpperCase()} ${tx.symbol || 'Unknown'}`,
    `${tx.date || 'Check date'} · ${Number(tx.shares) || 0} shares`,
    `${tx.currency || 'THB'} ${Number(tx.price) || 0} each`,
    `Confidence ${confidence}% · Date ${dateConfidence}%`,
  ].join('\n');
}

async function handleImageEvent(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  if (!supabaseReady()) {
    await replyLine(event.replyToken, textMessage('Supabase is not configured yet. Add the environment variables before using LINE chat saves.'));
    return;
  }

  const image = await downloadLineImage(event.message.id);
  const parsed = await extractTransactionFromImage(image);
  const tx = withClientId(parsed, event.message.id);

  if (shouldAutoSave(tx)) {
    const saved = await saveTransaction(lineUserId, tx);
    await replyLine(event.replyToken, textMessage(`Saved transaction ✅\n\n${formatTransaction(saved)}`));
    return;
  }

  const pending = await savePendingTransaction(lineUserId, {
    clientId: tx.clientId,
    messageId: event.message.id,
    payload: tx,
    confidence: tx.confidence,
    dateConfidence: tx.dateConfidence,
  });
  await replyLine(event.replyToken, [
    textMessage(`I read this, but please confirm before saving:\n\n${shortTxDetail(tx)}${tx.notes ? `\n\nNote: ${tx.notes}` : ''}`),
    pendingConfirmMessage(pending.id, shortTxDetail(tx)),
  ]);
}

async function handlePostbackEvent(event) {
  const lineUserId = event.source?.userId;
  const data = String(event.postback?.data || '');
  if (!lineUserId || !data.includes(':')) return;
  const [action, pendingId] = data.split(':');
  if (action === 'cancel_pending') {
    await deletePendingTransaction(lineUserId, pendingId);
    await replyLine(event.replyToken, textMessage('Cancelled. I did not save that transaction.'));
    return;
  }
  if (action !== 'save_pending') return;

  const pending = await getPendingTransaction(lineUserId, pendingId);
  if (!pending) {
    await replyLine(event.replyToken, textMessage('That draft is gone or expired. Please send the receipt again.'));
    return;
  }
  const saved = await saveTransaction(lineUserId, pending.payload || {});
  await deletePendingTransaction(lineUserId, pendingId);
  await replyLine(event.replyToken, textMessage(`Saved transaction ✅\n\n${formatTransaction(saved)}`));
}

async function handleTextEvent(event) {
  const lineUserId = event.source?.userId;
  const text = event.message?.text || '';
  if (!lineUserId) return;
  if (!supabaseReady()) {
    await replyLine(event.replyToken, textMessage('Supabase is not configured yet. Add the environment variables before asking portfolio questions.'));
    return;
  }

  const intent = await classifyPortfolioQuestion(text);
  if (!intent || intent.confidence < 0.45 || intent.intent === 'unknown') {
    await replyLine(event.replyToken, textMessage(portfolioHelpMessage()));
    return;
  }
  const transactions = await listTransactions(lineUserId);
  const portfolio = await buildPortfolio(transactions);
  const factualAnswer = answerPortfolioQuestion(intent, transactions, portfolio);
  const answer = await polishPortfolioAnswer({
    userMessage: text,
    factualAnswer,
    intent,
  });
  await replyLine(event.replyToken, textMessage(answer));
}

async function handleEvent(event) {
  if (event.type === 'message' && event.message?.type === 'image') return handleImageEvent(event);
  if (event.type === 'message' && event.message?.type === 'text') return handleTextEvent(event);
  if (event.type === 'postback') return handlePostbackEvent(event);
  if (event.replyToken) {
    await replyLine(event.replyToken, textMessage('Send a stock receipt screenshot, or ask about your portfolio.'));
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  if (!lineBotReady()) {
    response.status(501).json({ error: 'LINE bot is not configured. Add LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN.' });
    return;
  }

  const rawBody = await readRawBody(request);
  if (!verifyLineSignature(rawBody, request.headers['x-line-signature'])) {
    response.status(401).json({ error: 'Invalid LINE signature.' });
    return;
  }

  try {
    const body = JSON.parse(rawBody.toString('utf8') || '{}');
    for (const event of body.events || []) {
      try {
        await handleEvent(event);
      } catch (error) {
        if (event.replyToken) {
          await replyLine(event.replyToken, textMessage(`Sorry, I could not handle that yet: ${error.message || 'Unknown error'}`)).catch(() => {});
        }
      }
    }
    response.status(200).json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message || 'LINE webhook failed.' });
  }
}
