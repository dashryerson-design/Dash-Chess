/** In-memory stand-in for node:fs. Static data files are fetched at boot and registered here. */
const files = new Map<string, string>();
export function registerFile(path: string, content: string) {
  files.set(path, content);
}
const fs = {
  existsSync: (p: string) => files.has(p),
  readFileSync: (p: string) => {
    const f = files.get(p);
    if (f === undefined) throw new Error(`ENOENT: ${p}`);
    return f;
  },
  mkdirSync: () => undefined,
  statSync: () => ({ isFile: () => false, size: 0 }),
};
export default fs;
