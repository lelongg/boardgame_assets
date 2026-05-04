import assert from "node:assert/strict";
import { test } from "node:test";
import { createLatestSaveQueue } from "../src/lib/latestSaveQueue.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test("latest save queue writes the newest queued value after an in-flight save", async () => {
  const firstWrite = deferred();
  const calls = [];
  const queue = createLatestSaveQueue(async (value) => {
    calls.push(value);
    if (value === "first") await firstWrite.promise;
  });

  const first = queue.enqueue("first");
  const middle = queue.enqueue("middle");
  const latest = queue.enqueue("latest");

  assert.equal(await middle, "superseded");
  firstWrite.resolve();

  assert.equal(await first, "saved");
  assert.equal(await latest, "saved");
  assert.deepEqual(calls, ["first", "latest"]);
});
