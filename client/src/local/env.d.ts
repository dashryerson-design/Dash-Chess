/// <reference types="@fastify/cookie" />
declare module 'sql.js' {
  export interface Statement {
    bind(values?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  export interface Database {
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    run(sql: string, params?: unknown[]): Database;
    prepare(sql: string): Statement;
    getRowsModified(): number;
    export(): Uint8Array;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }
  export default function initSqlJs(config?: { locateFile?: (f: string) => string }): Promise<SqlJsStatic>;
}
