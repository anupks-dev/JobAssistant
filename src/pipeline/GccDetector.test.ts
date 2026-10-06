import { describe, expect, it } from "vitest";
import { Company } from "../db/repositories/CompanyRepository";
import { AppConfig } from "../config/AppConfig";
import { loadConfig } from "./FilterTestSupport";
import { GccDetector } from "./GccDetector";
import { PhraseMatcher } from "./PhraseMatcher";

describe("GccDetector", () => {
  const detector: GccDetector = new GccDetector(new PhraseMatcher());
  const config: AppConfig = loadConfig();

  it("does not treat GCC countries as a capability center", () => {
    const countries: boolean = detector.isGcc(
      "Tiny Startup",
      "We hire across GCC countries in the Gulf.",
      config.gcc.seedCompanies,
      config.gcc.keywords,
      [],
    );
    expect(countries).toBe(false);
    const center: boolean = detector.isGcc(
      "Tiny Startup",
      "Our GCC in Bangalore builds the platform.",
      config.gcc.seedCompanies,
      config.gcc.keywords,
      [],
    );
    expect(center).toBe(true);
  });

  it("accepts a seed company and a company flagged in the table", () => {
    expect(detector.isGcc("Apple", "", config.gcc.seedCompanies, config.gcc.keywords, [])).toBe(true);
    const flagged: Company = {
      id: 1,
      name: "Infracloud",
      nameKey: "infracloud",
      isGcc: true,
      isPreferred: false,
      isBlocked: false,
      atsType: null,
      boardSlug: null,
      firstSeenAt: "2026-10-04T00:00:00.000Z",
    };
    expect(detector.isGcc("Infracloud", "", [], [], [flagged])).toBe(true);
    expect(detector.isGcc("Dell", "", config.gcc.seedCompanies, config.gcc.keywords, [])).toBe(true);
    expect(detector.isGcc("Dellinger", "", config.gcc.seedCompanies, config.gcc.keywords, [])).toBe(false);
  });

  it("matches multinational aliases written differently on job boards", () => {
    const yes: string[] = [
      "JPMorganChase",
      "AWS India - Karnataka",
      "ADCI - Maharashtra",
      "Hewlett Packard Enterprise",
      "Danaher",
      "Cepheid",
      "SKF Group",
      "GE Vernova",
      "Netgear",
      "Bread Financial",
      "First Citizens India",
    ];
    for (let index: number = 0; index < yes.length; index++) {
      expect(detector.isGcc(yes[index], "", config.gcc.seedCompanies, config.gcc.keywords, [])).toBe(true);
    }
    const no: string[] = ["Emergent Labs", "Weekday AI", "Dellinger Systems"];
    for (let index: number = 0; index < no.length; index++) {
      expect(detector.isGcc(no[index], "", config.gcc.seedCompanies, config.gcc.keywords, [])).toBe(false);
    }
  });
});