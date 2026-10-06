import { describe, expect, it } from "vitest";
import { ProfileSections, SectionSplitter } from "./SectionSplitter";

describe("SectionSplitter", () => {
  it("finds standard headings and puts unknown text into other", () => {
    const source: string = [
      "Available immediately.",
      "SUMMARY",
      "Ships reliable services.",
      "SKILLS",
      "TypeScript",
      "EXPERIENCE",
      "Northwind Labs",
      "EDUCATION",
      "Example Institute",
      "PROJECTS",
      "Widget catalog",
      "CERTIFICATIONS",
      "Example certificate",
      "VOLUNTEERING",
      "Community garden",
    ].join("\n");
    const splitter: SectionSplitter = new SectionSplitter();
    const sections: ProfileSections = splitter.split(source);
    expect(sections.summary).toContain("Ships reliable services.");
    expect(sections.skills).toContain("TypeScript");
    expect(sections.experience).toContain("Northwind Labs");
    expect(sections.education).toContain("Example Institute");
    expect(sections.projects).toContain("Widget catalog");
    expect(sections.certifications).toContain("Example certificate");
    expect(sections.other).toContain("Available immediately.");
    expect(sections.other).toContain("Community garden");
    expect(sections.experience).not.toContain("Community garden");
  });
});
