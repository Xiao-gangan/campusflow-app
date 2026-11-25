import type { Database, SqlValue as WasmValue } from "sql.js";
import type { SqlDatabase, SqlValue } from "../../../shared/data/sql-database.ts";

function bind(parameters: SqlValue[]): WasmValue[] {
  return parameters.map((value) => {
    if (typeof value !== "bigint") return value;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new RangeError("SQLite demo integer exceeds safe range.");
    return number;
  });
}

export function wrapBrowserDatabase(database: Database): SqlDatabase {
  return {
    exec: (sql) => { database.run(sql); },
    prepare(sql) {
      function select(parameters: SqlValue[], first: boolean) {
        const statement = database.prepare(sql, bind(parameters));
        try {
          const rows = [];
          while (statement.step()) {
            rows.push(statement.getAsObject());
            if (first) break;
          }
          return rows;
        } finally {
          statement.free();
        }
      }
      return {
        get: (...args) => select(args, true)[0],
        all: (...args) => select(args, false),
        run(...args) {
          database.run(sql, bind(args));
          return { changes: database.getRowsModified() };
        },
      };
    },
    close: () => database.close(),
  };
}
