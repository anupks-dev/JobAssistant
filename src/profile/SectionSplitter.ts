export interface ProfileSections {
  summary: string;
  skills: string;
  experience: string;
  education: string;
  projects: string;
  certifications: string;
  other: string;
}

type SectionName = keyof ProfileSections;

interface HeadingRule {
  section: SectionName;
  pattern: RegExp;
}

// Splits redacted resume text on common heading lines. Unknown headings stay reviewable.
export class SectionSplitter {
  private readonly headingRules: HeadingRule[] = [
    { section: "summary", pattern: /^(professional\s+summary|summary|profile|objective|about(\s+me)?)$/i },
    { section: "skills", pattern: /^(technical\s+skills|core\s+skills|skills|technologies|competencies)$/i },
    { section: "experience", pattern: /^(professional\s+experience|work\s+experience|work\s+history|experience|employment)$/i },
    { section: "education", pattern: /^(education|academic\s+background|academics)$/i },
    { section: "projects", pattern: /^(personal\s+projects|key\s+projects|projects)$/i },
    { section: "certifications", pattern: /^(certifications|certificates|licenses|licences)$/i },
  ];

  public split(redactedText: string): ProfileSections {
    const buffers: Map<SectionName, string[]> = this.emptyBuffers();
    const lines: string[] = redactedText.split("\n");
    let currentSection: SectionName = "other";
    for (let index: number = 0; index < lines.length; index++) {
      const line: string = lines[index];
      const heading: SectionName | null = this.matchHeading(line);
      if (heading !== null) {
        currentSection = heading;
        continue;
      }
      const bucket: string[] | undefined = buffers.get(currentSection);
      if (bucket !== undefined) {
        bucket.push(line);
      }
    }
    return this.joinBuffers(buffers);
  }

  private matchHeading(line: string): SectionName | null {
    const normalized: string = this.normalizeHeading(line);
    if (normalized.length === 0) {
      return null;
    }
    const known: SectionName | null = this.matchKnownHeading(normalized);
    if (known !== null) {
      return known;
    }
    if (this.looksLikeUnknownHeading(normalized)) {
      return "other";
    }
    return null;
  }

  private normalizeHeading(line: string): string {
    let trimmed: string = line.trim();
    if (trimmed.endsWith(":")) {
      trimmed = trimmed.slice(0, trimmed.length - 1).trim();
    }
    return trimmed;
  }

  private matchKnownHeading(normalized: string): SectionName | null {
    for (let index: number = 0; index < this.headingRules.length; index++) {
      const rule: HeadingRule = this.headingRules[index];
      if (rule.pattern.test(normalized)) {
        return rule.section;
      }
    }
    return null;
  }

  // Short all-caps lines are headings even when the title is not one we know.
  private looksLikeUnknownHeading(normalized: string): boolean {
    if (normalized.length > 40) {
      return false;
    }
    if (normalized.indexOf(".") >= 0) {
      return false;
    }
    let hasLetter: boolean = false;
    for (let index: number = 0; index < normalized.length; index++) {
      const character: string = normalized.charAt(index);
      if (character >= "a" && character <= "z") {
        return false;
      }
      if (character >= "A" && character <= "Z") {
        hasLetter = true;
      }
    }
    return hasLetter;
  }

  private emptyBuffers(): Map<SectionName, string[]> {
    const buffers: Map<SectionName, string[]> = new Map<SectionName, string[]>();
    buffers.set("summary", []);
    buffers.set("skills", []);
    buffers.set("experience", []);
    buffers.set("education", []);
    buffers.set("projects", []);
    buffers.set("certifications", []);
    buffers.set("other", []);
    return buffers;
  }

  private joinBuffers(buffers: Map<SectionName, string[]>): ProfileSections {
    const sections: ProfileSections = {
      summary: this.joinLines(buffers.get("summary")),
      skills: this.joinLines(buffers.get("skills")),
      experience: this.joinLines(buffers.get("experience")),
      education: this.joinLines(buffers.get("education")),
      projects: this.joinLines(buffers.get("projects")),
      certifications: this.joinLines(buffers.get("certifications")),
      other: this.joinLines(buffers.get("other")),
    };
    return sections;
  }

  private joinLines(lines: string[] | undefined): string {
    if (lines === undefined) {
      return "";
    }
    let combined: string = "";
    for (let index: number = 0; index < lines.length; index++) {
      if (index > 0) {
        combined += "\n";
      }
      combined += lines[index];
    }
    return combined.trim();
  }
}
