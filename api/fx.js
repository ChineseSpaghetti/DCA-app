import { fetchFxRate } from './_market-data.js';

export default async function handler(request, response) {
  try {
    response.status(200).json(await fetchFxRate());
  } catch (error) {
    response.status(500).json({ error: error.message || 'FX rate unavailable.' });
  }
}
