import http from "node:http";
import { aiMiddleware } from "../dev/ai/middleware.ts";

const PORT = Number(process.env.AI_PORT ?? 8000);
const HOST = "127.0.0.1";
const allowMock = process.env.AI_MOCK === "1";
const server = http.createServer(aiMiddleware({
  allowMock,
  allowed: (request) => !request.headers.origin || request.headers.origin === `http://${request.headers.host}`,
}));

server.listen(PORT, HOST, () => {
  console.log(
    `[ai] CampusFlow AI local function listening on http://${HOST}:${PORT} (mock=${allowMock ? "on" : "off"})`,
  );
});

server.on("error", (error) => {
  console.error("[ai] server error", error.code ?? "unknown");
  process.exitCode = 1;
});
