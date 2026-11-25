const join = (...p: string[]) => p.filter(Boolean).join('/').replace(/\/+/g, '/');
const path = { join, resolve: join, dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '/', relative: (_a: string, b: string) => b };
export default path;
export { join };
