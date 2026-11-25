import test from "node:test";
import assert from "node:assert/strict";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
} from "../shared/auth/permissions.ts";

function actor(role, memberStatus = "active") {
  return {
    kind: "member",
    memberId: `${role}-member`,
    role,
    memberStatus,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

test("role permission matrix is explicit and least-privilege", () => {
  assert.equal(ROLE_PERMISSIONS.admin.length, PERMISSIONS.length);
  assert.equal(hasPermission("admin", "members.manage"), true);
  assert.equal(hasPermission("admin", "email_accounts.manage"), true);

  assert.equal(hasPermission("recruiter", "recruitment.send"), true);
  assert.equal(hasPermission("recruiter", "onboarding.manage"), true);
  assert.equal(hasPermission("recruiter", "scheduling.manage"), false);
  assert.equal(hasPermission("recruiter", "members.availability.read"), false);

  assert.equal(hasPermission("scheduler", "scheduling.manage"), true);
  assert.equal(hasPermission("scheduler", "members.availability.read"), true);
  assert.equal(hasPermission("scheduler", "recruitment.send"), false);
  assert.equal(hasPermission("scheduler", "email_accounts.manage"), false);

  assert.equal(hasPermission("member", "members.read"), false);
  assert.equal(hasPermission("member", "self.read"), true);
  assert.equal(hasPermission("member", "self.timetable.manage"), true);
});

test("requirePermission enforces active members and role permissions", () => {
  assert.equal(
    requirePermission(actor("admin"), "members.manage").role,
    "admin",
  );
  assert.equal(
    requirePermission(actor("recruiter"), "recruitment.send").role,
    "recruiter",
  );
  assert.equal(
    requirePermission(actor("scheduler"), "scheduling.manage").role,
    "scheduler",
  );

  expectCode(
    () => requirePermission(actor("member"), "members.read"),
    "forbidden",
  );
  expectCode(
    () => requirePermission(actor("recruiter"), "scheduling.manage"),
    "forbidden",
  );
  expectCode(
    () => requirePermission(actor("admin", "pending_onboarding"), "members.read"),
    "member_not_active",
  );
  expectCode(
    () => requirePermission({ kind: "candidate" }, "members.read"),
    "unauthorized",
  );
});
