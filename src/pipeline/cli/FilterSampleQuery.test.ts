import { describe, expect, it } from "vitest";
import { FilterSampleFormatter } from "../FilterSampleFormatter";
import { FilterSampleQuery, FilterSampleQueryReader } from "./FilterSampleQuery";

describe("filter sample options", () => {
  const reader: FilterSampleQueryReader = new FilterSampleQueryReader();

  it("reads source and offset", () => {
    const query: FilterSampleQuery = reader.read(["--reason=region_restricted", "--source=greenhouse", "--offset=20", "--limit=5"]);
    expect(query.reason).toBe("region_restricted");
    expect(query.source).toBe("greenhouse");
    expect(query.offset).toBe(20);
    expect(query.limit).toBe(5);
    expect(query.shortlisted).toBe(false);
    const shortlisted: FilterSampleQuery = reader.read(["--shortlisted", "--source=adzuna"]);
    expect(shortlisted.shortlisted).toBe(true);
    expect(shortlisted.source).toBe("adzuna");
    expect(shortlisted.offset).toBe(0);
  });

  it("rejects malformed options", () => {
    expect(() => reader.read(["--reason=title_excluded", "--source=adzuna--limit=25"])).toThrow(
      "Malformed option value: --source=adzuna--limit=25",
    );
    expect(() => reader.read(["--reason=title_excluded", "--unknown=1"])).toThrow("Unknown or malformed option: --unknown=1");
  });

  it("prints filter notes and no description", () => {
    const formatter: FilterSampleFormatter = new FilterSampleFormatter();
    const line: string = formatter.format(4, "greenhouse", "GitLab", "Senior Backend Engineer, India", "Bangalore, Karnataka", "bangalore_remote");
    expect(line).toBe("4 | greenhouse | GitLab | Senior Backend Engineer, India | Bangalore, Karnataka | bangalore_remote");
  });
});