import { fetchFxRate, fetchQuotesForTransactions } from './_market-data.js';

export function money(value, currency = 'THB') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number.isFinite(value) ? value : 0);
}

export function num(value, maximumFractionDigits = 4) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

export function convertAmount(amount, fromCurrency, toCurrency, fxRate) {
  const value = Number(amount) || 0;
  const from = fromCurrency || 'THB';
  const to = toCurrency || 'THB';
  const usdThb = Number(fxRate) || 35;
  if (from === to) return value;
  if (from === 'USD' && to === 'THB') return value * usdThb;
  if (from === 'THB' && to === 'USD') return value / usdThb;
  return value;
}

export function calculateHoldings(transactions, quotes = {}, fxRate = 35) {
  const map = new Map();
  const chronologicalTransactions = [...transactions].sort((a, b) => {
    const byDate = String(a.date || '').localeCompare(String(b.date || ''));
    if (byDate) return byDate;
    return String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || ''));
  });

  chronologicalTransactions.forEach((tx) => {
    const symbol = String(tx.symbol || '').toUpperCase();
    if (!symbol) return;
    const row = map.get(symbol) || { symbol, quantity: 0, soldQuantity: 0, cost: 0, realized: 0, currency: tx.currency || 'THB' };
    const qty = Number(tx.shares) || 0;
    const gross = Number(tx.stockValue) || qty * (Number(tx.price) || 0);
    const fee = Number(tx.fee) || 0;
    if (tx.side === 'sell') {
      const avg = row.quantity ? row.cost / row.quantity : 0;
      const matchedQty = Math.min(qty, row.quantity);
      const matchedGross = qty ? gross * (matchedQty / qty) : 0;
      const matchedFee = qty ? fee * (matchedQty / qty) : 0;
      row.quantity -= matchedQty;
      row.soldQuantity += matchedQty;
      row.cost -= avg * matchedQty;
      row.realized += matchedGross - matchedFee - avg * matchedQty;
    } else {
      row.quantity += qty;
      row.cost += gross + fee;
    }
    if (Math.abs(row.quantity) < 1e-10) row.quantity = 0;
    if (Math.abs(row.cost) < 1e-10) row.cost = 0;
    map.set(symbol, row);
  });

  return [...map.values()].map((row) => {
    const quote = quotes[row.symbol];
    const currentPrice = Number(quote?.price) || (row.quantity ? row.cost / row.quantity : 0);
    const currentPriceCurrency = quote?.currency || row.currency;
    const quotedValue = row.quantity * currentPrice;
    const currentValue = convertAmount(quotedValue, currentPriceCurrency, row.currency, fxRate);
    const avg = row.quantity ? row.cost / row.quantity : 0;
    const pl = currentValue - row.cost;
    return { ...row, currentPrice, currentPriceCurrency, currentValue, quotedValue, avg, pl, pct: row.cost ? (pl / row.cost) * 100 : 0, quote };
  });
}

export async function buildPortfolio(transactions, displayCurrency = 'THB') {
  const [fx, quoteResult] = await Promise.all([
    fetchFxRate().catch(() => ({ rate: 35, source: 'Fallback' })),
    fetchQuotesForTransactions(transactions).catch(() => ({ quotes: {}, errors: {} })),
  ]);
  const rows = calculateHoldings(transactions, quoteResult.quotes, fx.rate);
  const cost = rows.reduce((sum, row) => sum + convertAmount(row.cost, row.currency, displayCurrency, fx.rate), 0);
  const value = rows.reduce((sum, row) => sum + convertAmount(row.currentValue, row.currency, displayCurrency, fx.rate), 0);
  const realized = rows.reduce((sum, row) => sum + convertAmount(row.realized, row.currency, displayCurrency, fx.rate), 0);
  const unrealized = value - cost;
  const openRows = rows
    .filter((row) => row.quantity > 0)
    .map((row) => ({
      ...row,
      allocation: value ? (convertAmount(row.currentValue, row.currency, displayCurrency, fx.rate) / value) * 100 : 0,
    }))
    .sort((a, b) => b.allocation - a.allocation || a.symbol.localeCompare(b.symbol));
  return { rows, openRows, cost, value, realized, unrealized, fxRate: fx.rate, displayCurrency, quoteErrors: quoteResult.errors || {} };
}

export function formatTransaction(tx) {
  const total = (Number(tx.stockValue) || Number(tx.shares) * Number(tx.price)) + (Number(tx.fee) || 0);
  return `${String(tx.side || 'buy').toUpperCase()} ${num(Number(tx.shares) || 0)} ${tx.symbol}\n${tx.date || 'No date'} · ${money(Number(tx.price) || 0, tx.currency || 'THB')} each\nTotal ${money(total, tx.currency || 'THB')}`;
}

export function portfolioHelpMessage() {
  return [
    'Send a stock receipt screenshot to save a record.',
    '',
    'You can also ask:',
    '• How is my portfolio?',
    '• How much QQQM do I own?',
    '• Profit for SCB',
    '• Average cost QQQM',
    '• Recent records',
  ].join('\n');
}

export function answerPortfolioQuestion(intent, transactions, portfolio) {
  const symbol = String(intent.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, '');
  const rows = portfolio.openRows;
  const allRows = portfolio.rows;
  const currency = portfolio.displayCurrency;
  const findRow = () => allRows.find((row) => row.symbol === symbol);

  if (!transactions.length) {
    return 'No transactions yet. Send a receipt screenshot first and I will start tracking it.';
  }

  if (intent.intent === 'help' || intent.intent === 'unknown') return portfolioHelpMessage();

  if (intent.intent === 'recent_records') {
    const limit = Math.min(Math.max(Number(intent.limit) || 5, 1), 8);
    return transactions.slice(0, limit).map((tx) => `${tx.symbol} · ${String(tx.side || '').toUpperCase()}\n${tx.date} · ${num(Number(tx.shares) || 0)} shares at ${money(Number(tx.price) || 0, tx.currency || 'THB')}`).join('\n\n');
  }

  if (['symbol_holding', 'average_cost', 'unrealized_profit', 'realized_profit'].includes(intent.intent) && symbol) {
    const row = findRow();
    if (!row) return `I do not see ${symbol} in your records yet.`;
    return [
      `${row.symbol}`,
      `Qty: ${num(row.quantity)}`,
      `Avg: ${money(row.avg, row.currency)}`,
      `Last: ${money(row.currentPrice, row.currentPriceCurrency || row.currency)}`,
      `Value: ${money(convertAmount(row.currentValue, row.currency, currency, portfolio.fxRate), currency)}`,
      `Unrealized P/L: ${money(row.pl, row.currency)} (${row.pct.toFixed(2)}%)`,
      `Realized P/L: ${money(row.realized, row.currency)}`,
    ].join('\n');
  }

  if (intent.intent === 'top_gain' || intent.intent === 'top_loss') {
    const sorted = rows
      .filter((row) => row.quantity > 0)
      .sort((a, b) => intent.intent === 'top_gain' ? b.pl - a.pl : a.pl - b.pl)
      .slice(0, 3);
    if (!sorted.length) return 'No open holdings yet.';
    return sorted.map((row, index) => `${index + 1}. ${row.symbol}: ${money(row.pl, row.currency)} (${row.pct.toFixed(2)}%)`).join('\n');
  }

  const top = rows.slice(0, 5).map((row) => `${row.symbol}: ${money(convertAmount(row.currentValue, row.currency, currency, portfolio.fxRate), currency)} · P/L ${money(row.pl, row.currency)} (${row.pct.toFixed(2)}%)`);
  return [
    'Portfolio summary',
    `Cost: ${money(portfolio.cost, currency)}`,
    `Value: ${money(portfolio.value, currency)}`,
    `Unrealized P/L: ${money(portfolio.unrealized, currency)}`,
    `Realized P/L: ${money(portfolio.realized, currency)}`,
    '',
    top.length ? top.join('\n') : 'No open holdings.',
  ].join('\n');
}
