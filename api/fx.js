export default async function handler(request, response) {
  try {
    try {
      const yahooResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDTHB=X?range=1d&interval=1m', {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DCA-Ledger/0.1 vercel app',
        },
      });

      if (yahooResponse.ok) {
        const data = await yahooResponse.json();
        const error = data.chart?.error;
        if (error) throw new Error(error.description || error.code || 'Yahoo FX rate unavailable.');

        const result = data.chart?.result?.[0];
        const meta = result?.meta || {};
        const quote = result?.indicators?.quote?.[0] || {};
        const closes = quote.close || [];
        const latestClose = [...closes].reverse().find((value) => Number.isFinite(value));
        const rate = meta.regularMarketPrice || latestClose || meta.previousClose;

        if (Number.isFinite(rate)) {
          response.status(200).json({
            base: 'USD',
            quote: 'THB',
            rate,
            date: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : '',
            source: 'Yahoo Finance',
            sourceUrl: 'https://finance.yahoo.com/quote/USDTHB=X/',
          });
          return;
        }
      }
    } catch {}

    const fxResponse = await fetch('https://api.frankfurter.dev/v2/rate/USD/THB', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DCA-Ledger/0.1 vercel app',
      },
    });
    if (!fxResponse.ok) throw new Error('FX rate unavailable.');

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
