export function choose(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let result = 1n;
  for (let i = 1; i <= k; i++) result = result * BigInt(n - k + i) / BigInt(i);
  return result;
}

export function convolve(left: Map<number, bigint>, right: Map<number, bigint>): Map<number, bigint> {
  const result = new Map<number, bigint>();
  for (const [a, waysA] of left) for (const [b, waysB] of right) {
    result.set(a + b, (result.get(a + b) ?? 0n) + waysA * waysB);
  }
  return result;
}
