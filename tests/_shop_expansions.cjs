// Synthetic single-hour shop shared by arithmetic and browser scenarios.
exports.fixture = () => ({
  facts: {
    game: {promo: 0.5, wages: 0.7, capInitial: true, delivery: 50,
      wageBase: {cashier: 16, cleaner: 12, guard: 15, perCashier: 30}},
    hoods: {H: {idx: 1.2, strength: 1}},
    types: {T: {model: 'retail', products: [['P', 1], ['existing', 1]], amt: 1,
      days: Array(7).fill(1), hours: Array(24).fill(1),
      expansionDisplays: {P: [{capacity: 10, lines: [['display', 1], ['support', 1]], extra: []}]}}},
    market: {P: {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [0, 0, null]}},
      existing: {p: 10, r: 0.5, d: 1, cost: 4, hoods: {H: [1, 0, null]}}},
    items: {display: {p: 100, v: ['shop']}, support: {p: 20, v: ['shop']}},
    vendors: {shop: {n: 'Synthetic Fittings', a: '1 Test Street'}},
    built: {k: {sells: ['existing']}},
  },
  building: {key: 'k', hood: 'H', cap: 20, m2: 100, layout: 'C1', rent: 50},
  options: {sat: 50, promoTotal: 20, open: [[[10, 11]], [], [], [], [], [], []]},
});
