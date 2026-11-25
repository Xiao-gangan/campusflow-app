import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { BROWSER_DEMO_STORAGE } from "./mode.ts";
import { createBrowserDemoRuntime } from "./runtime.ts";

let runtime: ReturnType<typeof createBrowserDemoRuntime> | undefined;

export function browserDemoRuntime() {
  return runtime ??= createBrowserDemoRuntime(
    initSqlJs({ locateFile: () => wasmUrl }),
    window.localStorage,
    location.origin + location.pathname,
    async (operation) => await navigator.locks.request(BROWSER_DEMO_STORAGE, operation),
  );
}
