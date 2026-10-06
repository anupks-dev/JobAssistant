import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./FilterTestSupport";
import { RegionAssessment, RegionEligibilityClassifier } from "./RegionEligibilityClassifier";
import { PhraseMatcher } from "./PhraseMatcher";

describe("RegionEligibilityClassifier", () => {
  const classifier: RegionEligibilityClassifier = new RegionEligibilityClassifier(new PhraseMatcher());
  const openTerms: string[] = loadConfig().regionRules.openTerms;
  const restrictedTerms: string[] = loadConfig().regionRules.restrictedTerms;
  const genericWords: string[] = loadConfig().regionRules.genericWords;

  function assess(location: string, description: string): RegionAssessment {
    return classifier.classify(location, description, openTerms, restrictedTerms, genericWords);
  }

  it("classifies open, restricted, and unknown locations", () => {
    expect(assess("Worldwide", "").eligibility).toBe("open");
    expect(assess("Anywhere", "").eligibility).toBe("open");
    expect(assess("USA", "").eligibility).toBe("restricted");
    expect(assess("US, India", "").eligibility).toBe("open");
    expect(assess("Europe", "").eligibility).toBe("restricted");
    expect(assess("", "").eligibility).toBe("unknown");
    expect(assess("", "must be located in the US").eligibility).toBe("restricted");
    expect(assess("", "must be located in the US or India").eligibility).toBe("unknown");
    expect(assess("Remote", "Please join us on the team").eligibility).toBe("unknown");
  });

  it("uses a real Greenhouse location that names France", () => {
    const fixturePath: string = join(process.cwd(), "tests", "fixtures", "greenhouse.json");
    const payload: { jobs: { location: { name: string } }[] } = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      jobs: { location: { name: string } }[];
    };
    const location: string = payload.jobs[0].location.name;
    expect(location).toBe("Remote, France");
    expect(assess(location, "").eligibility).toBe("restricted");
    expect(assess(location, "").matchedTerm).toBe("france");
  });

  it("rejects leftover place names and keeps open or generic remote text", () => {
    expect(assess("Guatemala", "").eligibility).toBe("restricted");
    expect(assess("Czechia", "").eligibility).toBe("restricted");
    expect(assess("Remote (North America), SF, NYC", "").eligibility).toBe("restricted");
    expect(assess("Copenhagen or London", "").eligibility).toBe("restricted");
    expect(assess("London, Paris, Berlin, Tokyo, New York, Remote", "").eligibility).toBe("restricted");
    const manyCountries: string = "Europe, USA, UK, Canada, Australia, Ireland, Switzerland, Singapore, Mexico, Iceland, Norway";
    const many: RegionAssessment = assess(manyCountries, "");
    expect(many.eligibility).toBe("restricted");
    expect(many.namedPlace).toBe(true);
    expect(many.matchedTerm !== null && many.matchedTerm.length <= 40).toBe(true);
    expect(assess("Remote", "").eligibility).toBe("unknown");
    expect(assess("REMOTE", "").eligibility).toBe("unknown");
    expect(assess("Remote (Global)", "").eligibility).toBe("open");
    expect(assess("Anywhere in the World", "").eligibility).toBe("open");
    expect(assess("Remote - Worldwide", "").eligibility).toBe("open");
    const listed: RegionAssessment = assess("Remote in select countries (listed here", "");
    expect(listed.eligibility).toBe("restricted");
    expect(listed.namedPlace).toBe(true);
    expect(listed.matchedTerm).toBe("in select countries listed here");
  });

  it("rejects onsite or hybrid text that names no place", () => {
    expect(assess("Onsite", "").onsiteWithoutPlace).toBe(true);
    expect(assess("ONSITE", "").onsiteWithoutPlace).toBe(true);
    expect(assess("ONSITE or HYBRID", "").onsiteWithoutPlace).toBe(true);
    expect(assess("HYBRID", "").onsiteWithoutPlace).toBe(true);
    expect(assess("In-person", "").onsiteWithoutPlace).toBe(true);
    expect(assess("Remote", "").eligibility).toBe("unknown");
    expect(assess("REMOTE or HYBRID", "").eligibility).toBe("unknown");
    expect(assess("REMOTE or HYBRID", "").onsiteWithoutPlace).toBe(false);
    expect(assess("Remote (Global)", "").eligibility).toBe("open");
  });
});
