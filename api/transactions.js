import { requireLineUser } from './_line-auth.js';
import { supabaseReady } from './_supabase.js';
import { deleteTransaction, listTransactions, saveTransaction, updateTransaction } from './_transactions-store.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!supabaseReady()) {
    response.status(501).json({ error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.' });
    return;
  }

  try {
    const lineUserId = (await requireLineUser(request)).userId;

    if (request.method === 'GET') {
      response.status(200).json({ transactions: await listTransactions(lineUserId) });
      return;
    }

    if (request.method === 'POST') {
      response.status(200).json({ transaction: await saveTransaction(lineUserId, request.body || {}) });
      return;
    }

    if (request.method === 'PUT') {
      const id = String(request.query.id || '').trim();
      if (!id) {
        response.status(400).json({ error: 'Missing transaction id.' });
        return;
      }
      response.status(200).json({ transaction: await updateTransaction(lineUserId, id, request.body || {}) });
      return;
    }

    if (request.method === 'DELETE') {
      const id = String(request.query.id || '').trim();
      if (!id) {
        response.status(400).json({ error: 'Missing transaction id.' });
        return;
      }
      await deleteTransaction(lineUserId, id);
      response.status(200).json({ ok: true });
      return;
    }

    response.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || 'Transaction API failed.' });
  }
}
