export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetweenIso(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
