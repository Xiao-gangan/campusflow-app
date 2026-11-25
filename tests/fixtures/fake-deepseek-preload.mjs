const attempts = new Map();

function completion(content, finishReason = "stop") {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "deepseek-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

globalThis.fetch = async (_url, init = {}) => {
  const body = JSON.parse(String(init.body ?? "{}"));
  const prompt = Array.isArray(body.messages)
    ? body.messages.map((message) => String(message.content ?? "")).join("\n")
    : "";
  const marker = /\b(OLD_STALL|RETRY_STALL|NEW_OK)\b/u.exec(prompt)?.[1] ?? "NEW_OK";
  const idMatch = /组件 id=([^，]+)，type=([a-z_]+)/u.exec(prompt);
  const blockId = idMatch?.[1] ?? "synthetic-block";
  const blockType = idMatch?.[2] ?? "info_card";
  const key = `${marker}:${blockId}`;
  const attempt = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, attempt);
  console.log(`synthetic:start:${marker}:${attempt}:aborted=${init.signal?.aborted === true}`);

  const valid = JSON.stringify({
    blockId,
    blockType,
    fields: { variant: "style:soft" },
  });
  const truncated = JSON.stringify({
    blockId,
    blockType,
    fields: { title: "" },
  }).slice(0, 58);

  const waitForAbort = (fallback) =>
    new Promise((resolve, reject) => {
      if (init.signal?.aborted) {
        console.log(`synthetic:abort:${marker}:${attempt}`);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        console.log(`synthetic:return:${marker}:${attempt}`);
        resolve(fallback());
      }, 180);
      init.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          console.log(`synthetic:abort:${marker}:${attempt}`);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });

  if (marker === "OLD_STALL" && attempt === 1) {
    return waitForAbort(() => completion(truncated, "length"));
  }
  if (marker === "RETRY_STALL") {
    if (attempt === 1) {
      console.log(`synthetic:return:${marker}:1`);
      return completion(truncated, "length");
    }
    return waitForAbort(() => completion(valid));
  }
  console.log(`synthetic:return:${marker}:${attempt}`);
  return completion(valid);
};
