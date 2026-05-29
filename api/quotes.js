function providerSymbol(symbol, currency) {
  const clean = symbol.trim().toUpperCase();
  if (clean.includes('.') || clean.startsWith('^')) return clean;
  if (currency === 'THB') return `${clean}.BK`;
  return clean;
}

async function fetchQuote(symbol, currency) {
  const yahooSymbol = providerSymbol(symbol, currency);
  const encoded = encodeURIComponent(yahooSymbol);
  const quoteResponse = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1d&interval=1d`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DCA-Ledger/0.1 vercel app',
    },
  });

  if (!quoteResponse.ok) {
    throw new Error(`Quote unavailable: ${quoteResponse.status}`);
  }

  const data = await quoteResponse.json();
  const error = data.chart?.error;
  if (error) throw new Error(error.description || error.code || 'Quote unavailable');

  const result = data.chart?.result?.[0];
  const meta = result?.meta || {};
  const price = meta.regularMarketPrice || meta.previousClose;
  if (price == null) throw new Error('Price unavailable');

  return {
    symbol,
    providerSymbol: yahooSymbol,
    price,
    currency: meta.currency || currency,
    exchange: meta.exchangeName || '',
    marketTime: meta.regularMarketTime || 0,
    source: 'Yahoo Finance chart',
  };
}

export default async function handler(request, response) {
  const items = String(request.query.items || '');
  const quotes = {};
  const errors = {};

  await Promise.all(
    items.split(',').filter(Boolean).map(async (item) => {
      const [rawSymbol, rawCurrency = 'USD'] = item.split(':');
      const symbol = rawSymbol.trim().toUpperCase();
      const currency = rawCurrency.trim().toUpperCase();
      if (!symbol) return;
      try {
        quotes[symbol] = await fetchQuote(symbol, currency);
      } catch (error) {
        errors[symbol] = error.message || 'Quote unavailable';
      }
    }),
  );

  response.status(200).json({
    quotes,
    errors,
    source: 'Yahoo Finance chart',
    sourceUrl: 'https://finance.yahoo.com/',
  });
}
