export type SqlValue = string | number | bigint | Uint8Array | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...parameters: SqlValue[]): SqlRow | undefined;
    all(...parameters: SqlValue[]): SqlRow[];
    run(...parameters: SqlValue[]): { changes: number | bigint };
  };
  close(): void;
}
