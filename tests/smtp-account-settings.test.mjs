import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { SMTP_PRESETS } from "../shared/email/smtp-presets.ts";
import { openSmtpSecretVault } from "../dev/recruitment/smtp-secrets.ts";
import { openSmtpAccountStore, testSmtpAccount, testSmtpConnection } from "../dev/recruitment/smtp-store.ts";
import { encodeSmtpDisplayName } from "../dev/recruitment/smtp-transport.ts";
import { rsvpMiddleware, smtpTestMode, publicOrigin } from "../dev/rsvp/plugin.ts";

async function openStore() {
  const dir = await mkdtemp(join(tmpdir(), "campusflow-smtp-"));
  const file = join(dir, "mail.sqlite");
  const vault = openSmtpSecretVault(file);
  const store = openSmtpAccountStore(file, vault);
  return { dir, file, store };
}

const accountInput = (overrides = {}) => ({
  provider: "qq",
  label: "招新 QQ 邮箱",
  fromName: "招新组",
  fromEmail: "recruit@example.test",
  credential: "synthetic-auth-code",
  ...overrides,
});

test("SMTP presets use fixed official host, TLS and port values", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SMTP_PRESETS).map(([id, preset]) => [id, [preset.host, preset.port, preset.encryption]])),
    {
      qq: ["smtp.qq.com", 465, "ssl"],
      "163": ["smtp.163.com", 465, "ssl"],
      "126": ["smtp.126.com", 465, "ssl"],
      exmail: ["smtp.exmail.qq.com", 465, "ssl"],
    },
  );
});

test("credentials are encrypted server-side, never returned, and arbitrary hosts are ignored", async () => {
  const { dir, file, store } = await openStore();
  try {
    const secret = "synthetic-auth-code";
    const account = store.create({
      ...accountInput(),
      smtpHost: "evil.example.test",
      smtpPort: 25,
    });
    assert.equal(account.smtpHost, "smtp.qq.com");
    assert.equal(account.smtpPort, 465);
    assert.equal(account.encryption, "ssl");
    assert.equal(account.hasSecret, true);
    assert.equal(account.status, "unverified");
    assert.equal(JSON.stringify(store.list()).includes(secret), false);
    assert.equal(Object.hasOwn(account, "credential"), false);
    assert.equal(existsSync(join(dir, "smtp-credentials.key")), true);
    assert.equal(readFileSync(file).includes(Buffer.from(secret)), false);
    const raw = new DatabaseSync(file, { readOnly: true });
    try {
      const row = raw.prepare("SELECT secret_payload FROM demo_smtp_account WHERE id=?").get(account.id);
      assert.match(String(row.secret_payload), /^v1\./u);
      assert.equal(String(row.secret_payload).includes(secret), false);
    } finally {
      raw.close();
    }
  } finally {
    store.close();
  }
});

test("credential replacement resets verification, while metadata edits preserve it", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput());
    const verified = store.setTestResult(account.id, true, "accepted", "synthetic");
    assert.equal(verified.status, "verified");
    assert.equal(verified.verificationMethod, "synthetic");
    const renamed = store.update(account.id, {
      ...accountInput({ credential: undefined }),
      fromName: "新招新组",
    });
    assert.equal(renamed.status, "verified");
    assert.equal(renamed.fromName, "新招新组");
    const replaced = store.update(account.id, accountInput({ credential: "new-synthetic-code" }));
    assert.equal(replaced.status, "unverified");
    assert.equal(replaced.lastTestedAt, null);
    assert.equal(replaced.lastErrorCode, null);
    assert.equal(replaced.hasSecret, true);
  } finally {
    store.close();
  }
});

test("changing sender address or provider invalidates verification and clears the old credential", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput());
    store.setTestResult(account.id, true, "accepted", "synthetic");
    const addressChanged = store.update(account.id, {
      ...accountInput({ credential: undefined, fromEmail: "new-address@example.test" }),
    });
    assert.equal(addressChanged.status, "unverified");
    assert.equal(addressChanged.hasSecret, false);
    assert.equal(addressChanged.verificationMethod, null);
    assert.equal(addressChanged.lastTestedAt, null);

    const providerChanged = store.create(accountInput({ fromEmail: "provider@example.test" }));
    store.setTestResult(providerChanged.id, true, "accepted", "synthetic");
    const switched = store.update(providerChanged.id, {
      ...accountInput({ credential: undefined, provider: "163", fromEmail: "provider@example.test" }),
    });
    assert.equal(switched.status, "unverified");
    assert.equal(switched.hasSecret, false);
    assert.equal(switched.smtpHost, "smtp.163.com");

    const nameOnly = store.create(accountInput({ fromEmail: "name@example.test" }));
    store.setTestResult(nameOnly.id, true, "accepted", "synthetic");
    const renamed = store.update(nameOnly.id, {
      ...accountInput({ credential: undefined, fromEmail: "name@example.test", fromName: "只改名称" }),
    });
    assert.equal(renamed.status, "verified");
    assert.equal(renamed.hasSecret, true);
  } finally {
    store.close();
  }
});

test("a delayed test cannot revive a disabled or reconfigured account", async () => {
  const { store } = await openStore();
  try {
    const config = { mode: "synthetic", recipient: "test@example.test" };
    let release;
    let started;
    const start = new Promise((resolve) => { started = resolve; });
    const transport = {
      sendTest: () => new Promise((resolve) => {
        started();
        release = resolve;
      }),
    };
    const account = store.create(accountInput({ fromEmail: "delayed@example.test" }));
    const pending = testSmtpAccount(store, config, account.id, "test@example.test", transport);
    await start;
    store.disable(account.id);
    release({ ok: true, code: "accepted", subject: "s", bodyText: "b" });
    const stale = await pending;
    assert.equal(stale.code, "stale_test");
    assert.equal(stale.account.status, "disabled");
    assert.equal(stale.account.verificationMethod, null);
    assert.equal(store.listInbox().length, 0);

    let releaseSecond;
    let startedSecond;
    const startSecond = new Promise((resolve) => { startedSecond = resolve; });
    const secondTransport = {
      sendTest: () => new Promise((resolve) => {
        startedSecond();
        releaseSecond = resolve;
      }),
    };
    const second = store.create(accountInput({ fromEmail: "changed@example.test" }));
    const pendingSecond = testSmtpAccount(store, config, second.id, "test@example.test", secondTransport);
    await startSecond;
    store.update(second.id, {
      ...accountInput({ credential: undefined, fromEmail: "changed-new@example.test" }),
    });
    releaseSecond({ ok: true, code: "accepted", subject: "s", bodyText: "b" });
    const staleSecond = await pendingSecond;
    assert.equal(staleSecond.code, "stale_test");
    assert.equal(staleSecond.account.status, "unverified");
    assert.equal(staleSecond.account.fromEmail, "changed-new@example.test");
    assert.equal(store.listInbox().length, 0);
  } finally {
    store.close();
  }
});

test("default and disabled transitions keep at most one usable default", async () => {
  const { store } = await openStore();
  try {
    const first = store.create(accountInput());
    const second = store.create(accountInput({
      provider: "163",
      label: "备选 163",
      fromEmail: "backup@example.test",
      isDefault: true,
    }));
    assert.equal(second.isDefault, true);
    assert.equal(store.get(first.id)?.isDefault, false);
    const disabled = store.disable(second.id);
    assert.equal(disabled.status, "disabled");
    assert.equal(disabled.isDefault, false);
    assert.equal(store.get(first.id)?.isDefault, true);
  } finally {
    store.close();
  }
});

test("test sending is gated by switch, recipient, credential and disabled state", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput());
    const disabled = await testSmtpAccount(store, { mode: "disabled", recipient: "test@example.test" }, account.id, "test@example.test");
    assert.equal(disabled.code, "real_test_disabled");
    assert.equal(disabled.mode, "disabled");
    assert.equal(disabled.inboxItem, null);
    assert.equal(store.listInbox().length, 0);

    const missingRecipient = await testSmtpAccount(store, { mode: "synthetic", recipient: null }, account.id, "test@example.test");
    assert.equal(missingRecipient.code, "test_recipient_not_configured");

    const wrongRecipient = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, account.id, "other@example.test");
    assert.equal(wrongRecipient.code, "recipient_not_allowed");
    assert.equal(store.listInbox().length, 0);

    const withoutCredential = store.create(accountInput({ fromEmail: "empty@example.test", credential: "" }));
    const missingCredential = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, withoutCredential.id, "test@example.test");
    assert.equal(missingCredential.code, "missing_credential");
    assert.equal(missingCredential.account.status, "unverified");

    store.disable(account.id);
    const disabledTest = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, account.id, "test@example.test");
    assert.equal(disabledTest.code, "account_disabled");
  } finally {
    store.close();
  }
});

test("synthetic auth/connection failures are retryable and success writes only the local inbox", async () => {
  const { store } = await openStore();
  try {
    const auth = store.create(accountInput({ fromEmail: "auth@example.test", credential: "synthetic-fail-auth" }));
    const authResult = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, auth.id, "test@example.test");
    assert.equal(authResult.ok, false);
    assert.equal(authResult.code, "auth_failed");
    assert.equal(authResult.account.status, "failed");
    assert.equal(authResult.inboxItem, null);

    const retried = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, auth.id, "test@example.test");
    assert.equal(retried.code, "auth_failed");
    assert.equal(store.listInbox().length, 0);

    const connection = store.create(accountInput({ fromEmail: "connect@example.test", credential: "synthetic-fail-connect" }));
    const connectionResult = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, connection.id, "test@example.test");
    assert.equal(connectionResult.code, "connection_failed");
    assert.equal(connectionResult.account.status, "failed");

    const replaced = store.update(auth.id, accountInput({ fromEmail: "auth@example.test", credential: "synthetic-ok" }));
    assert.equal(replaced.status, "unverified");
    const accepted = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, auth.id, "test@example.test");
    assert.equal(accepted.ok, true);
    assert.equal(accepted.code, "accepted");
    assert.equal(accepted.mode, "synthetic");
    assert.equal(accepted.account.status, "verified");
    assert.equal(accepted.account.verificationMethod, "synthetic");
    assert.match(accepted.message, /本机合成/u);
    assert.equal(accepted.inboxItem?.recipient, "test@example.test");
    assert.equal(accepted.inboxItem?.bodyText.includes("synthetic-ok"), false);
    assert.equal(store.listInbox().length, 1);
  } finally {
    store.close();
  }
});

test("real mode is explicit and can be verified with an injected local transport", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput({ fromEmail: "real-mode@example.test" }));
    const transport = {
      async sendTest() {
        return {
          ok: true,
          code: "accepted",
          method: "real",
          subject: "真实测试",
          bodyText: "synthetic local transport only",
        };
      },
    };
    const result = await testSmtpAccount(
      store,
      { mode: "real", recipient: "test@example.test" },
      account.id,
      "test@example.test",
      transport,
    );
    assert.equal(result.mode, "real");
    assert.equal(result.code, "accepted");
    assert.equal(result.account.verificationMethod, "real");
    assert.match(result.message, /真实 SMTP 已接收/u);
    assert.equal(store.listInbox().length, 1);
  } finally {
    store.close();
  }
});

test("connection test stops after AUTH and never sends MAIL/RCPT/DATA or writes the inbox", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput({ fromEmail: "connect-only@example.test" }));
    const commands = [];
    const transport = {
      async testConnection() {
        commands.push("TLS handshake", "EHLO", "AUTH LOGIN", "235");
        return { ok: true, code: "connected", method: "synthetic" };
      },
    };
    const result = await testSmtpConnection(store, { mode: "synthetic" }, account.id, transport);
    assert.equal(result.code, "connected");
    assert.equal(result.mode, "synthetic");
    assert.match(result.message, /未发送邮件/u);
    assert.equal(result.account.status, "unverified");
    assert.equal(result.account.lastTestedAt, null);
    assert.deepEqual(commands, ["TLS handshake", "EHLO", "AUTH LOGIN", "235"]);
    assert.doesNotMatch(commands.join(" "), /MAIL FROM|RCPT TO|DATA/u);
    assert.equal(store.listInbox().length, 0);

    const real = await testSmtpConnection(store, { mode: "real" }, account.id, {
      async testConnection() {
        return { ok: true, code: "connected", method: "real" };
      },
    });
    assert.equal(real.code, "connected");
    assert.equal(real.mode, "real");
    assert.match(real.message, /未执行 MAIL FROM \/ RCPT TO \/ DATA/u);
    assert.equal(real.account.status, "unverified");
    assert.equal(store.listInbox().length, 0);
  } finally {
    store.close();
  }
});

test("connection test reports disabled, missing credential, disabled account and auth failures without status mutation", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput({ fromEmail: "connection-errors@example.test" }));
    const disabledMode = await testSmtpConnection(store, { mode: "disabled" }, account.id);
    assert.equal(disabledMode.code, "real_test_disabled");
    const missing = store.create(accountInput({ fromEmail: "no-secret@example.test", credential: "" }));
    const missingCredential = await testSmtpConnection(store, { mode: "synthetic" }, missing.id);
    assert.equal(missingCredential.code, "missing_credential");
    const auth = await testSmtpConnection(store, { mode: "synthetic" }, account.id, {
      async testConnection() {
        return { ok: false, code: "auth_failed", method: "synthetic" };
      },
    });
    assert.equal(auth.code, "auth_failed");
    assert.match(auth.message, /认证失败.*未发送邮件/u);
    assert.equal(auth.account.status, "unverified");
    store.disable(account.id);
    const disabled = await testSmtpConnection(store, { mode: "synthetic" }, account.id);
    assert.equal(disabled.code, "account_disabled");
    assert.equal(store.listInbox().length, 0);
  } finally {
    store.close();
  }
});

test("a delayed connection result cannot overwrite a disabled account", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput({ fromEmail: "delayed-connection@example.test" }));
    let release;
    let started;
    const start = new Promise((resolve) => { started = resolve; });
    const transport = {
      testConnection: () => new Promise((resolve) => {
        started();
        release = resolve;
      }),
    };
    const pending = testSmtpConnection(store, { mode: "synthetic" }, account.id, transport);
    await start;
    store.disable(account.id);
    release({ ok: true, code: "connected", method: "synthetic" });
    const result = await pending;
    assert.equal(result.code, "stale_test");
    assert.equal(result.account.status, "disabled");
    assert.equal(store.get(account.id)?.status, "disabled");
    assert.equal(store.listInbox().length, 0);
  } finally {
    store.close();
  }
});

test("SMTP display names use encoded words and reject header control characters", async () => {
  const encoded = encodeSmtpDisplayName("招新组");
  assert.match(encoded, /^=\?UTF-8\?B\?.+\?=$/u);
  assert.equal(Buffer.from(encoded.slice(10, -2), "base64").toString("utf8"), "招新组");
  assert.throws(() => encodeSmtpDisplayName("招新\r\nBcc: evil@example.test"), /控制字符/u);
  const { store } = await openStore();
  try {
    assert.throws(
      () => store.create(accountInput({ fromName: "招新\nBcc: evil@example.test" })),
      (error) => error.status === 400,
    );
    assert.throws(
      () => store.create(accountInput({ fromEmail: "sender\r\n@example.test" })),
      (error) => error.status === 400,
    );
  } finally {
    store.close();
  }
});

test("disabled accounts stay disabled after configuration edits", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput());
    store.disable(account.id);
    const edited = store.update(account.id, accountInput({
      provider: "163",
      fromEmail: "edited@example.test",
      credential: "new-synthetic-code",
    }));
    assert.equal(edited.status, "disabled");
    const tested = await testSmtpAccount(store, { mode: "synthetic", recipient: "test@example.test" }, account.id, "test@example.test");
    assert.equal(tested.code, "account_disabled");
  } finally {
    store.close();
  }
});

test("invalid SMTP account POST bodies return recoverable 400 responses instead of 500", async () => {
  const { store } = await openStore();
  const handler = rsvpMiddleware(
    () => { throw new Error("store is not used by SMTP routes"); },
    undefined,
    () => store,
  );
  const server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(base + "/api/local-demo/mail/smtp-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-CampusFlow-Demo": "1",
      },
      body: JSON.stringify(body),
    });
  try {
    for (const body of [
      {},
      { provider: "qq" },
      { provider: "qq", fromEmail: "sender@example.test" },
      { provider: "qq", fromEmail: "sender@example.test", fromName: "发件人", credential: 42 },
    ]) {
      const response = await post(body);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).message, "string");
    }
    const valid = await post(accountInput());
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).data.fromEmail, "recruit@example.test");
    const mode = await fetch(base + "/api/local-demo/mail/smtp-test-mode", {
      headers: { Origin: base, "X-CampusFlow-Demo": "1" },
    });
    assert.equal(mode.status, 200);
    const modeBody = (await mode.json()).data;
    assert.equal(modeBody.mode, "synthetic");
    assert.equal(modeBody.recipientConfigured, false);
    assert.equal(Object.hasOwn(modeBody, "recipient"), false);
  } finally {
    store.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
test("local SMTP defaults to real, with offline and legacy settings respected", () => {
  assert.equal(smtpTestMode({}), "real");
  assert.equal(smtpTestMode({ CAMPUSFLOW_SMTP_MODE: "synthetic" }), "synthetic");
  assert.equal(smtpTestMode({ CAMPUSFLOW_SMTP_MODE: "disabled" }), "disabled");
  assert.equal(smtpTestMode({ CAMPUSFLOW_REAL_MAIL_TEST: "1" }), "synthetic");
  assert.equal(smtpTestMode({ CAMPUSFLOW_REAL_MAIL_TEST: "0" }), "disabled");
  assert.equal(smtpTestMode({ CAMPUSFLOW_REAL_MAIL_TEST: "1", CAMPUSFLOW_REAL_SMTP_TEST: "1" }), "real");
  assert.equal(smtpTestMode({ NODE_TEST_CONTEXT: "child-v8", CAMPUSFLOW_SMTP_MODE: "real" }), "synthetic");
  assert.throws(() => smtpTestMode({ CAMPUSFLOW_SMTP_MODE: "unknown" }));
  assert.equal(publicOrigin("https://recruiting.example.test/"), "https://recruiting.example.test");
  assert.throws(() => publicOrigin("ftp://recruiting.example.test/"));
  assert.throws(() => publicOrigin("https://recruiting.example.test/private"));
});

test("real test mode accepts an explicit mailbox and rejects unsafe recipients before SMTP", async () => {
  const { store } = await openStore();
  try {
    const account = store.create(accountInput());
    const config = { mode: "real", recipient: null };
    const called = [];
    const transport = {
      async sendTest({ recipient }) {
        called.push(recipient);
        return { ok: true, code: "accepted", method: "real", subject: "Test", bodyText: "Offline" };
      },
    };
    for (const to of ["invalid", "person@example.test\r\nBcc: other@example.test", "person@example.test>"]) {
      assert.equal((await testSmtpAccount(store, config, account.id, to, transport)).code, "invalid_recipient");
    }
    assert.deepEqual(called, []);
    assert.equal((await testSmtpAccount(store, config, account.id, "local+test@example.test", transport)).ok, true);
    assert.deepEqual(called, ["local+test@example.test"]);
    const restricted = { ...config, recipient: "whitelist@example.test" };
    assert.equal((await testSmtpAccount(store, restricted, account.id, "local+test@example.test", transport)).code, "recipient_not_allowed");
  } finally {
    store.close();
  }
});
