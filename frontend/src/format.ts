export function formatAccuracy(correctCount: number | null | undefined, total: number): string {
  const fixed = (total ? (correctCount ?? 0) / total * 100 : 0).toFixed(2)
  return Number.isInteger(Number(fixed)) ? String(Number(fixed)) : fixed
}
