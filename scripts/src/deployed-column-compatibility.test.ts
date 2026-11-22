import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignItems, insertCampaignItemSchema, insertTicketSchema, tickets } from "@workspace/db";

test("the deployed text flag keeps its boolean input and output contract", () => {
  const flag = campaignItems.wasBumpedToBackup;
  assert.equal(flag.getSQLType(), "text");
  assert.equal(flag.mapToDriverValue(true), "true");
  assert.equal(flag.mapToDriverValue(false), "false");
  assert.equal(flag.mapFromDriverValue("true"), true);
  assert.equal(flag.mapFromDriverValue("false"), false);
  assert.equal(insertCampaignItemSchema.shape.wasBumpedToBackup.parse(undefined), false);
  assert.equal(insertCampaignItemSchema.shape.wasBumpedToBackup.parse(true), true);
});

test("ticket completion arrays can be omitted or set explicitly, but cannot be cleared with null", () => {
  for (const name of ["crewMemberUserIds", "completionPhotoStorageKeys"] as const) {
    assert.equal(tickets[name].notNull, true);
    assert.equal(tickets[name].hasDefault, true);
    const field = insertTicketSchema.shape[name];
    assert.equal(field.parse(undefined), undefined);
    assert.deepEqual(field.parse([]), []);
    assert.equal(field.safeParse(null).success, false);
  }
});
