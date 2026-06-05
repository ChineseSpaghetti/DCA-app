import { fetchQuote } from './_market-data.js';

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
