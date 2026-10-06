import { describe, expect, it } from "vitest";
import { FilterDecision } from "../JobFilter";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { CurrencyConverter } from "../CurrencyConverter";
import { SalaryFilter } from "./SalaryFilter";

describe("SalaryFilter", () => {
  const filter: SalaryFilter = new SalaryFilter(new CurrencyConverter());
  const context = makeContext(loadConfig(), new FixedClock(new Date("2026-10-04T12:00:00.000Z")), [], [], [], []);

  function decide(min: number | null, max: number | null, currency: string | null, known: boolean, estimated: boolean): FilterDecision {
    return filter.evaluate(makeJob({
      salaryMin: min,
      salaryMax: max,
      currency: currency,
      salaryKnown: known,
      salaryIsEstimated: estimated,
    }), context);
  }

  it("rejects low USD, converts EUR, skips INR, and flags unknown or estimated salary", () => {
    expect(decide(120000, 120000, "USD", true, false).reasonCode).toBe("salary_below_min");
    const high: FilterDecision = decide(200000, 200000, "USD", true, false);
    expect(high.passed).toBe(true);
    expect(high.salaryUsdMax).toBe(200000);
    const euros: FilterDecision = decide(100000, 100000, "EUR", true, false);
    expect(euros.reasonCode).toBe("salary_below_min");
    expect(euros.salaryUsdMax).toBe(108000);
    const rupees: FilterDecision = decide(500000, 500000, "INR", true, false);
    expect(rupees.passed).toBe(true);
    expect(rupees.notes).toBeUndefined();
    const unknown: FilterDecision = decide(null, null, null, false, false);
    expect(unknown.passed).toBe(true);
    expect(unknown.notes).toBe("salary_unknown");
    const estimated: FilterDecision = decide(200000, 200000, "USD", true, true);
    expect(estimated.passed).toBe(true);
    expect(estimated.notes).toBe("salary_unknown");
  });
});
