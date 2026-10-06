import { describe, expect, it } from "vitest";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { PostingAgeFilter } from "./PostingAgeFilter";

describe("PostingAgeFilter", () => {
  const filter: PostingAgeFilter = new PostingAgeFilter();
  const now: Date = new Date("2026-10-04T12:00:00.000Z");
  const clock: FixedClock = new FixedClock(now);
  const context = makeContext(loadConfig(), clock, [], [], [], []);

  it("rejects postings older than the window and falls back to fetchedAt", () => {
    const oldPosted: Date = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(filter.evaluate(makeJob({ postedAt: oldPosted }), context).reasonCode).toBe("too_old");
    const recentFetch: Date = new Date(now.getTime() - 60 * 60 * 1000);
    expect(filter.evaluate(makeJob({ postedAt: null, fetchedAt: recentFetch }), context).passed).toBe(true);
    const oldFetch: Date = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(filter.evaluate(makeJob({ postedAt: null, fetchedAt: oldFetch }), context).reasonCode).toBe("too_old");
  });
});
