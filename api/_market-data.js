export function providerSymbol(symbol, currency) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (clean.includes('.') || clean.startsWith('^')) return clean;
  if (currency === 'THB') return `${clean}.BK`;
  return clean;
}

export async function fetchQuote(symbol, currency = 'USD') {
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

export async function fetchQuotesForTransactions(transactions) {
  const items = new Map();
  transactions.forEach((tx) => {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    if (!symbol) return;
    if (!items.has(symbol)) items.set(symbol, tx.currency || 'USD');
  });

  const quotes = {};
  const errors = {};
  await Promise.all([...items.entries()].map(async ([symbol, currency]) => {
    try {
      quotes[symbol] = await fetchQuote(symbol, currency);
    } catch (error) {
      errors[symbol] = error.message || 'Quote unavailable';
    }
  }));
  return { quotes, errors };
}

export async function fetchFxRate() {
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
        return {
          base: 'USD',
          quote: 'THB',
          rate,
          date: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : '',
          source: 'Yahoo Finance',
          sourceUrl: 'https://finance.yahoo.com/quote/USDTHB=X/',
        };
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
  return {
    base: 'USD',
    quote: 'THB',
    rate: data.rate,
    date: data.date || '',
    source: 'Frankfurter',
    sourceUrl: 'https://frankfurter.dev/',
  };
}
