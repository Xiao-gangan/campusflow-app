export const RSVP_PURPOSES = ["interview"] as const;
export type RsvpPurpose = (typeof RSVP_PURPOSES)[number];

export const RSVP_RESPONSE_VALUES = ["attending", "not_attending"] as const;
export type RsvpResponseValue = (typeof RSVP_RESPONSE_VALUES)[number];

export type RsvpToken = {
  id: string;
  applicantId: string;
  campaignId: string | null;
  tokenHash: string;
  purpose: RsvpPurpose;
  round: number;
  expiresAt: string;
  revokedAt: string | null;
  firstRespondedAt: string | null;
  lastRespondedAt: string | null;
  createdAt: string;
};

export type RsvpResponse = {
  id: string;
  tokenId: string;
  response: RsvpResponseValue;
  note: string | null;
  submittedAt: string;
};
