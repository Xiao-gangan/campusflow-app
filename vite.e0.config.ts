import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const entry = process.env.E0_ENTRY ?? "dev/tiptap-probe.html";
const outDir = process.env.E0_OUT ?? "/tmp/e0-probe-dist";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL(entry, import.meta.url)),
    },
  },
});
