import { describe, expect, it } from "vitest";
import { StoredJob } from "../../db/repositories/JobRepository";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { DuplicateFilter } from "./DuplicateFilter";

describe("DuplicateFilter", () => {
  const filter: DuplicateFilter = new DuplicateFilter();
  const clock: FixedClock = new FixedClock(new Date("2026-10-04T12:00:00.000Z"));

  it("keeps the full description and rejects an already sent key", () => {
    const snippet: StoredJob = makeJob({
      id: 1,
      source: "greenhouse",
      description: "Short.",
      descriptionIsSnippet: true,
      dedupeKey: "same",
    });
    const full: StoredJob = makeJob({
      id: 2,
      source: "adzuna",
      description: "A longer full description of the role.",
      descriptionIsSnippet: false,
      dedupeKey: "same",
    });
    const context = makeContext(loadConfig(), clock, [], [], [snippet, full], []);
    expect(filter.evaluate(full, context).passed).toBe(true);
    expect(filter.evaluate(snippet, context).reasonCode).toBe("duplicate");
    const sentContext = makeContext(loadConfig(), clock, [], ["same"], [full], []);
    expect(filter.evaluate(full, sentContext).reasonCode).toBe("already_sent");
  });
});
