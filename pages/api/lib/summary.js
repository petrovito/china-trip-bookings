// pages/api/lib/summary.js
export const EXPENSE_TYPES = ["flight", "hotel", "train", "ticket", "food", "shopping"];

function peterShare(b) {
  if (!b.price) return 0;
  const p = parseFloat(b.price);
  if (b.travelers === "peter") return p;
  if (b.travelers === "friend") return 0;
  return p / 2;
}

export function computeCurrencySummaries(bookings) {
  const byCurrency = new Map();

  for (const b of bookings || []) {
    if (!b?.price || !b?.currency || !EXPENSE_TYPES.includes(b.type)) continue;
    const currency = b.currency;
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, {
        currency,
        total: 0,
        pendingTotal: 0,
        pOwes: 0,
        count: 0,
        pendingCount: 0,
        settledCount: 0,
        byCategory: {},
      });
    }

    const bucket = byCurrency.get(currency);
    const price = parseFloat(b.price);
    bucket.total += price;
    bucket.count += 1;
    bucket.byCategory[b.type] = (bucket.byCategory[b.type] || 0) + price;

    if (!b.paid_by) {
      bucket.pendingTotal += price;
      bucket.pendingCount += 1;
      continue;
    }

    if (b.settled) bucket.settledCount += 1;
    else {
      const fronted = b.paid_by === "peter" ? price : 0;
      bucket.pOwes += peterShare(b) - fronted;
    }
  }

  return {
    currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
