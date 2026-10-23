import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMetres } from "../server/geo.mjs";

const studio = { latitude: 22.5531, longitude: 88.3517 };

test("a fix on the studio pin is zero metres away", () => {
  assert.equal(distanceMetres(studio.latitude, studio.longitude, studio.latitude, studio.longitude), 0);
});

test("about a hundred metres due north stays inside a 150 metre fence", () => {
  const distance = distanceMetres(studio.latitude, studio.longitude, studio.latitude + 0.0009, studio.longitude);
  assert.ok(distance > 90 && distance < 110, String(distance));
});

test("a fix two kilometres north is outside the studio fence", () => {
  const distance = distanceMetres(studio.latitude, studio.longitude, studio.latitude + 0.02, studio.longitude);
  assert.ok(distance > 2000 && distance < 2300, String(distance));
});
