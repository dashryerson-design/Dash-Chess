/** Subset of node:crypto used by server/src/social.ts */
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
export default { randomBytes };
export { randomBytes };
