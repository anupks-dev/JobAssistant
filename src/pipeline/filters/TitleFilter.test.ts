import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { StoredJob } from "../../db/repositories/JobRepository";
import { FixedClock, loadConfig, makeContext, makeJob } from "../FilterTestSupport";
import { PhraseMatcher } from "../PhraseMatcher";
import { TitlePrimarySegment } from "../TitlePrimarySegment";
import { TitleFilter } from "./TitleFilter";

describe("TitleFilter", () => {
  const filter: TitleFilter = new TitleFilter(new PhraseMatcher(), new TitlePrimarySegment());
  const context = makeContext(loadConfig(), new FixedClock(new Date("2026-10-04T12:00:00.000Z")), [], [], [], []);

  function decide(title: string): string | null {
    const job: StoredJob = makeJob({ title: title });
    const passed: boolean = filter.evaluate(job, context).passed;
    if (passed) {
      return null;
    }
    return filter.evaluate(job, context).reasonCode ?? null;
  }

  it("matches senior backend, tech lead, and solutions architect titles", () => {
    expect(decide("Senior Back-End Engineer")).toBeNull();
    expect(decide("Tech Lead - Payments")).toBeNull();
    expect(decide("Solutions Architect")).toBeNull();
    const fixturePath: string = join(process.cwd(), "tests", "fixtures", "remoteok.json");
    const rows: { position?: string }[] = JSON.parse(readFileSync(fixturePath, "utf8")) as { position?: string }[];
    let fixtureTitle: string = "";
    for (let index: number = 0; index < rows.length; index++) {
      if (rows[index].position !== undefined) {
        fixtureTitle = rows[index].position ?? "";
      }
    }
    expect(fixtureTitle).toBe("Senior Backend Engineer");
    expect(decide(fixtureTitle)).toBeNull();
  });

  it("rejects intern, junior, sales, and data titles", () => {
    expect(decide("Backend Intern")).toBe("title_excluded");
    expect(decide("Junior Developer")).toBe("title_excluded");
    expect(decide("Sales Engineer")).toBe("title_excluded");
    expect(decide("Data Engineer")).toBe("title_excluded");
  });

  it("matches architect and software development titles and rejects other functions", () => {
    expect(decide("Principal Infrastructure Architect: Data Platform")).toBeNull();
    expect(decide("Full Stack Developer")).toBeNull();
    expect(decide("Senior Software Development Engineer, Prime Video Sports")).toBeNull();
    expect(decide("Team Lead Talent Acquisition (d/w/m)")).toBe("title_excluded");
    expect(decide("Senior Manager, Solutions Architect")).toBeNull();
    expect(decide("Tech Lead")).toBeNull();
    expect(decide("Engineering Manager")).toBe("title_no_match");
    expect(decide("SDE")).toBeNull();
    expect(decide("Sdewalk")).toBe("title_no_match");
    expect(decide("HR")).toBe("title_excluded");
    expect(decide("Shrink")).toBe("title_no_match");
  });

  it("excludes product, mobile, and hardware titles without touching backend titles", () => {
    expect(decide("Product Engineer (Product Manager role, not a Full-stack role)")).toBe("title_excluded");
    expect(decide("Android Software Engineer")).toBe("title_excluded");
    expect(decide("SOC Verification Principal Engineer")).toBe("title_excluded");
    expect(decide("Senior Software Engineer (Rust, Python, C, Embedded Linux)")).toBe("title_excluded");
    expect(decide("Senior Backend Engineer")).toBeNull();
    expect(decide("iOS Engineer")).toBe("title_excluded");
    expect(decide("Radios Engineer")).toBe("title_no_match");
    expect(decide("Tech Lead")).toBeNull();
  });

  it("checks function words only in the primary segment and allows pre-sales", () => {
    expect(decide("Software Development Engineer II, EU INTech - Prime and Marketing Tech")).toBeNull();
    expect(decide("Pre-sales Solution Architect (High Tech) - Expert Professional")).toBeNull();
    expect(decide("Software Engineer, Sales Platform")).toBeNull();
    expect(decide("Marketing Manager, Attraction, Influence & Marketing (AIM)")).toBe("title_excluded");
    expect(decide("IT Recruiter")).toBe("title_excluded");
    expect(decide("HR Generalist")).toBe("title_excluded");
    expect(decide("Partner Account Executive")).toBe("title_excluded");
    expect(decide("Sr. Product Manager - Tech, Alexa Smart Properties")).toBe("title_excluded");
    expect(decide("Staff Technical Project Manager")).toBe("title_excluded");
  });
});
