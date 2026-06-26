/** FNV-1a 32-bit hash — deterministic layout seed */
export function hashStr(input) {
  const s = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Map hash sub-seeds to roughly normal noise in [-1, 1] */
export function gauss3(ra, rb, rc) {
  const u1 = (ra >>> 0) / 4294967296;
  const u2 = (rb >>> 0) / 4294967296;
  const u3 = (rc >>> 0) / 4294967296;
  const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-9))) * Math.cos(2 * Math.PI * u2);
  const z1 = Math.sqrt(-2 * Math.log(Math.max(u2, 1e-9))) * Math.cos(2 * Math.PI * u3);
  return (z0 + z1) * 0.35;
}

export function hashSeed(base, salt) {
  return hashStr(`${base}::${salt}`);
}

/** 0..1 均匀随机；用独立子种子，避免高位 shift 后精度塌陷 */
export function hashUnit(h, shift = 0) {
  return (hashSeed(h, `unit:${shift}`) >>> 0) / 4294967296;
}
