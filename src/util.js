// Small, dependency-free helpers shared by the analysis and rendering code.

/** Return `n` as a number, or `null` when it is missing / not numeric. */
export function num(n) {
  if (n === null || n === undefined || n === "") return null;
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Round to `d` decimals (default 2). `null` passes through. */
export function round(n, d = 2) {
  const v = num(n);
  if (v === null) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Safe division: returns `null` when the denominator is 0 / missing. */
export function ratio(a, b, d = 2) {
  const x = num(a);
  const y = num(b);
  if (x === null || !y) return null;
  return round(x / y, d);
}

/** Percentage a/b*100, rounded. */
export function pct(a, b, d = 1) {
  const r = ratio(a, b, 6);
  return r === null ? null : round(r * 100, d);
}

export function sum(rows, key) {
  let s = 0;
  for (const r of rows) s += num(typeof key === "function" ? key(r) : r[key]) ?? 0;
  return s;
}

export function mean(values) {
  const xs = values.map(num).filter((v) => v !== null);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pearson correlation coefficient of two equally long numeric arrays. */
export function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [num(x), num(ys[i])]).filter(([a, b]) => a !== null && b !== null);
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return round(sxy / Math.sqrt(sxx * syy), 3);
}

/** Least-squares line y = a + b*x. Returns {a, b} or null. */
export function linearFit(xs, ys) {
  const pairs = xs.map((x, i) => [num(x), num(ys[i])]).filter(([a, b]) => a !== null && b !== null);
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  if (!sxx) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * Sort a copy of `rows` by `key` (string or accessor). `dir` is "desc" (default) or "asc".
 * Rows whose key is null are pushed to the end.
 */
export function sortBy(rows, key, dir = "desc") {
  const get = typeof key === "function" ? key : (r) => r[key];
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((p, q) => {
    const a = num(get(p));
    const b = num(get(q));
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a - b) * sign;
  });
}

export function top(rows, key, n = 5, dir = "desc") {
  return sortBy(rows, key, dir).slice(0, n);
}

export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function indexBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(typeof key === "function" ? key(r) : r[key], r);
  return m;
}

/**
 * Parse an age string such as "29-017" (years-days) into decimal years.
 * Plain integers ("29") are returned as-is.
 */
export function parseAge(age) {
  if (age === null || age === undefined) return null;
  const s = String(age);
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const years = Number(m[1]);
  const days = m[2] ? Number(m[2]) : 0;
  return round(years + days / 365, 2);
}

/**
 * Parse a match-event minute like "45+2" or "90+6" into {base, added, total}.
 * `total` is a sortable number (45+2 -> 45.02).
 */
export function parseMinute(minute) {
  if (minute === null || minute === undefined) return null;
  const m = String(minute).match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const base = Number(m[1]);
  const added = m[2] ? Number(m[2]) : 0;
  return { base, added, total: base + added / 100 };
}

/** Strip the "vs " prefix PremAnalytics uses on opponent-stat squad names. */
export function cleanSquad(name) {
  return typeof name === "string" ? name.replace(/^vs\s+/i, "") : name;
}

/** Parse a "W L W W W" form string into counts. */
export function parseForm(form) {
  const res = { w: 0, d: 0, l: 0, pts: 0, games: 0 };
  if (!form) return res;
  for (const ch of String(form).toUpperCase().replace(/[^WDL]/g, "")) {
    res.games += 1;
    if (ch === "W") {
      res.w += 1;
      res.pts += 3;
    } else if (ch === "D") {
      res.d += 1;
      res.pts += 1;
    } else res.l += 1;
  }
  return res;
}

export function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Make a value safe for a filename. */
export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
