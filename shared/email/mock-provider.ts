import type { EmailSendInput, EmailSendResult, EmailTransport } from "../contracts/email.ts";

export class MockEmailTransport implements EmailTransport {
  readonly name = "mock" as const;

  async send(_input: EmailSendInput): Promise<EmailSendResult> {
    return {
      providerMessageId: `mock-${crypto.randomUUID()}`,
      status: "simulated",
    };
  }

  async testAccount(): Promise<{ ok: boolean; code: string }> {
    return { ok: true, code: "mock_verified" };
  }

  async sendTest(): Promise<{ ok: boolean; code: string }> {
    return { ok: true, code: "mock_test_sent" };
  }
}
