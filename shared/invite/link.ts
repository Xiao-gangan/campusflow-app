export function inviteHref(base: string, token: string, browser = false) {
  return browser ? `${base}#/invite/${token}` : `${base}#/invite/rsvp?token=${token}`;
}
