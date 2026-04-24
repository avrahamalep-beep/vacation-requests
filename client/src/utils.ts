/** Inclusive business days Mon–Fri between two YYYY-MM-DD dates. */
export function countBusinessDays(startYmd: string, endYmd: string): number {
  if (!startYmd || !endYmd) return 0;
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  if (a > b) return 0;
  let n = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Each calendar day in range [start, end] inclusive as YYYY-MM-DD */
export function enumerateDays(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  if (a > b) return out;
  const cur = new Date(a);
  while (cur <= b) {
    out.push(formatIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return parseYmd(aStart) <= parseYmd(bEnd) && parseYmd(bStart) <= parseYmd(aEnd);
}
