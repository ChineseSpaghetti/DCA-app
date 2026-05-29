export default async function handler(request, response) {
  try {
    const fxResponse = await fetch('https://api.frankfurter.dev/v2/rate/USD/THB', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DCA-Ledger/0.1 vercel app',
      },
    });

    if (!fxResponse.ok) {
      const detail = await fxResponse.text();
      response.status(fxResponse.status).json({ error: detail || 'FX rate unavailable.' });
      return;
    }

    const data = await fxResponse.json();
    response.status(200).json({
      base: 'USD',
      quote: 'THB',
      rate: data.rate,
      date: data.date || '',
      source: 'Frankfurter',
      sourceUrl: 'https://frankfurter.dev/',
    });
  } catch (error) {
    response.status(500).json({ error: error.message || 'FX rate unavailable.' });
  }
}
