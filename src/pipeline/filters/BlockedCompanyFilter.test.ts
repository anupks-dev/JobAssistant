import { describe, expect, it } from "vitest";
import { AppConfig } from "../../config/AppConfig";
import { Company } from "../../db/repositories/CompanyRepository";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { PhraseMatcher } from "../PhraseMatcher";
import { BlockedCompanyFilter } from "./BlockedCompanyFilter";

describe("BlockedCompanyFilter", () => {
  const filter: BlockedCompanyFilter = new BlockedCompanyFilter(new PhraseMatcher());
  const clock: FixedClock = new FixedClock(new Date("2026-10-04T12:00:00.000Z"));

  it("rejects config blocks and companies flagged in the table", () => {
    const config: AppConfig = loadConfig();
    const blockedConfig: AppConfig = {
      ...config,
      companies: { preferred: config.companies.preferred, blocked: ["Acme"] },
    };
    const flagged: Company = {
      id: 4,
      name: "Hidden Co",
      nameKey: "hidden co",
      isGcc: false,
      isPreferred: false,
      isBlocked: true,
      atsType: null,
      boardSlug: null,
      firstSeenAt: "2026-10-04T00:00:00.000Z",
    };
    const context = makeContext(blockedConfig, clock, [flagged], [], [], []);
    expect(filter.evaluate(makeJob({ company: "Acme" }), context).reasonCode).toBe("blocked_company");
    expect(filter.evaluate(makeJob({ company: "Hidden Co" }), context).reasonCode).toBe("blocked_company");
    expect(filter.evaluate(makeJob({ company: "Example Labs" }), context).passed).toBe(true);
  });
});
