import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ROUTE,
  isAppRoute,
  normalizePath,
  parseHash,
  pathToHash,
} from "../src/app/navigation.ts";

test("empty and unknown hashes fall back to the home route", () => {
  assert.equal(parseHash(""), DEFAULT_ROUTE);
  assert.equal(parseHash("#"), DEFAULT_ROUTE);
  assert.equal(parseHash("#/unknown"), DEFAULT_ROUTE);
  assert.equal(normalizePath("recruitment"), DEFAULT_ROUTE);
});

test("known hashes normalize to app routes", () => {
  assert.equal(parseHash("#/"), "/");
  assert.equal(parseHash("#/recruitment"), "/recruitment");
  assert.equal(parseHash("#/designer"), "/designer");
  assert.equal(parseHash("#/invite/preview"), "/invite/preview");
  assert.equal(parseHash("#/invite/preview?preset=formal"), "/invite/preview");
  assert.equal(parseHash("#/recruitment/"), "/recruitment");
  assert.equal(parseHash("#/designer?view=overview"), "/designer");
  assert.equal(parseHash("#/invite/rsvp?token=example"), "/invite/rsvp");
});

test("retired scheduling links fall back to overview", () => {
  assert.equal(isAppRoute("/scheduling"), false);
  for (const hash of ["#/scheduling", "#/scheduling/", "#/scheduling?term=2026"]) {
    assert.equal(parseHash(hash), DEFAULT_ROUTE);
  }
});

test("route guards and hash helpers stay consistent", () => {
  assert.equal(isAppRoute("/recruitment"), true);
  assert.equal(isAppRoute("/designer"), true);
  assert.equal(isAppRoute("/invite/preview"), true);
  assert.equal(isAppRoute("/unknown"), false);
  assert.equal(pathToHash("/"), "#/");
  assert.equal(pathToHash("/invite/preview"), "#/invite/preview");
});
