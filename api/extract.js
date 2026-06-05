import { extractTransactionFromImage } from './_gemini-extract.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const { image } = request.body || {};
    response.status(200).json(await extractTransactionFromImage(image));
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || 'Gemini extraction failed.' });
  }
}
