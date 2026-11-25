import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command, mode, isPreview }) => {
  const local = command === "serve" && !isPreview && mode === "rsvp-demo";
  return {
    plugins: [
      react(),
      ...(local ? [(await import("./dev/rsvp/plugin.ts")).localRsvpPlugin()] : []),
    ],
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    server: {
      host: process.env.CAMPUSFLOW_HOST || "127.0.0.1",
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      allowedHosts: local && process.env.CAMPUSFLOW_PUBLIC_URL
        ? [new URL(process.env.CAMPUSFLOW_PUBLIC_URL).hostname]
        : undefined,
    },
    preview: { host: "127.0.0.1" },
    build: { outDir: "dist" },
  };
});
