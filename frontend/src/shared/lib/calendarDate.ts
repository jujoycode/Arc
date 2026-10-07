const DAY_MS = 86_400_000

export function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(0)
  result.setUTCFullYear(year, month - 1, day); result.setUTCHours(0, 0, 0, 0)
  return result
}
export function toDateKey(date: Date): string { return date.toISOString().slice(0, 10) }
export function addDays(date: Date, count: number): Date { return new Date(date.getTime() + count * DAY_MS) }
export function startOfMonth(date: Date): Date { return parseDate(`${toDateKey(date).slice(0, 7)}-01`) }
export function addMonths(date: Date, count: number): Date { const result = startOfMonth(date); result.setUTCMonth(result.getUTCMonth() + count); return result }
export function daysBetween(start: Date, end: Date): number { return Math.round((end.getTime() - start.getTime()) / DAY_MS) }
export function currentMonth(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }
