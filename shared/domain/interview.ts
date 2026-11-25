import type {
  InterviewInvitation,
  InterviewInvitationStatus,
  InterviewRsvpStatus,
} from "../contracts/interview.ts";

export type InterviewLifecycleError =
  | "invalid_timestamp"
  | "terminal_status"
  | "invite_expired"
  | "invalid_transition"
  | "version_conflict"
  | "rsvp_not_open";

export type InterviewLifecycleResult =
  | { ok: true; invite: InterviewInvitation }
  | { ok: false; error: InterviewLifecycleError };

export function isInterviewTerminal(
  status: InterviewInvitationStatus,
): boolean {
  return status === "revoked" || status === "expired";
}

export function isInterviewInvitationUsable(
  invite: InterviewInvitation,
  at: string,
): boolean {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return false;
  if (isInterviewTerminal(invite.status)) return false;
  if (invite.revokedAt) return false;
  return Date.parse(invite.expiresAt) > atMs;
}

export function revokeInterviewInvitation(
  invite: InterviewInvitation,
  at: string,
): InterviewLifecycleResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return { ok: false, error: "invalid_timestamp" };
  if (isInterviewTerminal(invite.status)) {
    return { ok: false, error: "terminal_status" };
  }
  return {
    ok: true,
    invite: {
      ...invite,
      status: "revoked",
      revokedAt: at,
      version: invite.version + 1,
      updatedAt: at,
    },
  };
}

export function rotateInterviewInvitationToken(
  invite: InterviewInvitation,
  newTokenHash: string,
  at: string,
): InterviewLifecycleResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return { ok: false, error: "invalid_timestamp" };
  if (isInterviewTerminal(invite.status)) {
    return { ok: false, error: "terminal_status" };
  }
  if (Date.parse(invite.expiresAt) <= atMs) {
    return { ok: false, error: "invite_expired" };
  }
  return {
    ok: true,
    invite: {
      ...invite,
      tokenHash: newTokenHash,
      version: invite.version + 1,
      updatedAt: at,
    },
  };
}

export function markInterviewInvitationSent(
  invite: InterviewInvitation,
  expectedVersion: number,
  at: string,
): InterviewLifecycleResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return { ok: false, error: "invalid_timestamp" };
  if (isInterviewTerminal(invite.status)) {
    return { ok: false, error: "terminal_status" };
  }
  if (Date.parse(invite.expiresAt) <= atMs) {
    return { ok: false, error: "invite_expired" };
  }
  if (invite.version !== expectedVersion) {
    return { ok: false, error: "version_conflict" };
  }
  if (invite.status === "sent") {
    return { ok: true, invite };
  }
  if (invite.status !== "draft" && invite.status !== "ready") {
    return { ok: false, error: "invalid_transition" };
  }
  return {
    ok: true,
    invite: {
      ...invite,
      status: "sent",
      sentAt: at,
      version: invite.version + 1,
      updatedAt: at,
    },
  };
}

export function respondToInterviewInvitation(
  invite: InterviewInvitation,
  rsvpStatus: Exclude<InterviewRsvpStatus, "pending">,
  at: string,
): InterviewLifecycleResult {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return { ok: false, error: "invalid_timestamp" };
  if (!isInterviewInvitationUsable(invite, at)) {
    return { ok: false, error: "rsvp_not_open" };
  }
  if (invite.status !== "ready" && invite.status !== "sent") {
    return { ok: false, error: "rsvp_not_open" };
  }
  return {
    ok: true,
    invite: {
      ...invite,
      rsvpStatus,
      respondedAt: at,
      version: invite.version + 1,
      updatedAt: at,
    },
  };
}

export function canApplyAsyncInterviewResult(
  invite: InterviewInvitation,
  expected: { version: number; status: InterviewInvitationStatus },
  at: string,
): boolean {
  if (!isInterviewInvitationUsable(invite, at)) return false;
  return invite.version === expected.version && invite.status === expected.status;
}
