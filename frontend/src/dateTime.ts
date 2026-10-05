export function localDateTime(value: string): string {
  const instant = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(instant.getTime()) ? '시간 정보 없음' : instant.toLocaleString('ko-KR')
}
