import { describe, expect, it } from "vitest";
import { FilterDecision } from "../JobFilter";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { GccDetector } from "../GccDetector";
import { LocationNormalizer } from "../LocationNormalizer";
import { PhraseMatcher } from "../PhraseMatcher";
import { RegionEligibilityClassifier } from "../RegionEligibilityClassifier";
import { LocationFilter } from "./LocationFilter";

describe("LocationFilter", () => {
  const phrases: PhraseMatcher = new PhraseMatcher();
  const filter: LocationFilter = new LocationFilter(
    new LocationNormalizer(phrases),
    new RegionEligibilityClassifier(phrases),
    new GccDetector(phrases),
    phrases,
  );
  const context = makeContext(loadConfig(), new FixedClock(new Date("2026-10-04T12:00:00.000Z")), [], [], [], []);

  function decide(company: string, location: string, remoteType: "remote" | "hybrid" | "onsite" | "unknown"): FilterDecision {
    return filter.evaluate(makeJob({
      company: company,
      location: location,
      remoteType: remoteType,
      description: "Build services.",
    }), context);
  }

  it("keeps Bangalore GCC roles and rejects other onsite cities", () => {
    const apple: FilterDecision = decide("Apple", "Bengaluru", "onsite");
    expect(apple.passed).toBe(true);
    expect(apple.isBangaloreGcc).toBe(true);
    const startup: FilterDecision = decide("Tiny Startup", "Bangalore", "hybrid");
    expect(startup.reasonCode).toBe("not_gcc");
    expect(decide("Tiny Startup", "Berlin", "onsite").reasonCode).toBe("onsite_other_location");
  });

  it("keeps worldwide remote roles and rejects US-only remote roles", () => {
    const worldwide: FilterDecision = decide("Example Labs", "Remote - Worldwide", "remote");
    expect(worldwide.passed).toBe(true);
    expect(worldwide.regionEligibility).toBe("open");
    const unitedStates: FilterDecision = decide("Example Labs", "Remote (US only)", "remote");
    expect(unitedStates.reasonCode).toBe("region_restricted");
    expect(unitedStates.notes).toBe("us");
  });

  it("rejects named places and keeps a Bangalore role that mentions remote work", () => {
    const copenhagen: FilterDecision = decide("Example Labs", "Copenhagen or London", "onsite");
    expect(copenhagen.reasonCode).toBe("onsite_other_location");
    const capitals: FilterDecision = decide("Kraken Tech", "London, Paris, Berlin, Tokyo, New York, Remote", "remote");
    expect(capitals.reasonCode).toBe("region_restricted");
    const gitLab: FilterDecision = filter.evaluate(makeJob({
      company: "GitLab",
      title: "Senior Backend Engineer, India",
      location: "Bangalore, Karnataka",
      remoteType: "onsite",
      description: "This role is remote for engineers in India.",
    }), context);
    expect(gitLab.passed).toBe(true);
    expect(gitLab.notes).toBe("bangalore_remote");
    expect(gitLab.regionEligibility).toBe("open");
    expect(gitLab.isBangaloreGcc).toBe(false);
    const companies: string[] = ["Okta", "Databricks", "Salesforce", "ABB", "N-able"];
    for (let index: number = 0; index < companies.length; index++) {
      const decision: FilterDecision = decide(companies[index], "Bangalore", "onsite");
      expect(decision.passed).toBe(true);
      expect(decision.isBangaloreGcc).toBe(true);
    }
  });

  it("rejects onsite or hybrid text with no place and still applies Bangalore rules", () => {
    expect(decide("Small prop-trading firm", "Onsite", "onsite").reasonCode).toBe("onsite_other_location");
    expect(decide("Veo Technologies", "ONSITE", "onsite").reasonCode).toBe("onsite_other_location");
    expect(decide("Albs", "ONSITE or HYBRID", "hybrid").reasonCode).toBe("onsite_other_location");
    expect(decide("Example Labs", "HYBRID", "hybrid").reasonCode).toBe("onsite_other_location");
    expect(decide("Example Labs", "In-person", "onsite").reasonCode).toBe("onsite_other_location");
    expect(decide("Example Labs", "Remote", "remote").passed).toBe(true);
    expect(decide("Example Labs", "REMOTE or HYBRID", "hybrid").passed).toBe(true);
    expect(decide("Example Labs", "REMOTE or HYBRID", "hybrid").regionEligibility).toBe("unknown");
    const hybridBangalore: FilterDecision = decide("Apple", "Hybrid, Bangalore", "hybrid");
    expect(hybridBangalore.passed).toBe(true);
    expect(hybridBangalore.isBangaloreGcc).toBe(true);
    expect(decide("Tiny Startup", "Hybrid, Bangalore", "hybrid").reasonCode).toBe("not_gcc");
  });
});
