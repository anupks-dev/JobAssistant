import { createHash } from "crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { PiiValueStore } from "./PiiValueStore";
import { PrivateTextFileWriter } from "./PrivateTextFileWriter";
import { ProfileBuilder, ProfileBuildResult } from "./ProfileBuilder";
import { Profile, ProfileLoader } from "./ProfileLoader";
import { ResumeTextExtractor } from "./ResumeTextExtractor";
import { SectionSplitter } from "./SectionSplitter";

const directories: string[] = [];

class FixedResumeTextExtractor extends ResumeTextExtractor {
  public constructor(private readonly fixedText: string) {
    super("unused-path");
  }

  public async extractText(): Promise<string> {
    return this.fixedText;
  }
}

function resumeText(): string {
  return [
    "Jordan Hale",
    "jordan.hale@example.com | +91 98765 43210 | https://linkedin.com/in/jordanhale",
    "SUMMARY",
    "Engineer at Northwind Labs using TypeScript.",
    "EXPERIENCE",
    "Built APIs at Northwind Labs.",
  ].join("\n");
}

function writeInputs(resumeBytes: string): { directoryPath: string; resumePath: string; piiPath: string; profilePath: string } {
  const directoryPath: string = mkdtempSync(join(tmpdir(), "jobagent-build-"));
  directories.push(directoryPath);
  const resumePath: string = join(directoryPath, "resume.docx");
  const piiPath: string = join(directoryPath, "pii-values.json");
  const profilePath: string = join(directoryPath, "profile.json");
  writeFileSync(resumePath, resumeBytes, "utf-8");
  const pii: object = {
    fullName: "Jordan Hale",
    alternateNames: [],
    emails: ["jordan.hale@example.com"],
    phones: ["9876543210"],
    addresses: [],
    otherValues: [],
  };
  writeFileSync(piiPath, JSON.stringify(pii), "utf-8");
  return { directoryPath: directoryPath, resumePath: resumePath, piiPath: piiPath, profilePath: profilePath };
}

function hashFile(filePath: string): string {
  const bytes: Buffer = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function writeExistingProfile(profilePath: string, sourceFileHash: string, approved: boolean): void {
  const profile: object = {
    version: 1,
    approved: approved,
    approvedAt: approved ? "2024-02-02T00:00:00.000Z" : null,
    sourceFileHash: sourceFileHash,
    builtAt: "2024-02-02T00:00:00.000Z",
    sections: {
      summary: "old",
      skills: "",
      experience: "",
      education: "",
      projects: "",
      certifications: "",
      other: "",
    },
    redactionCounts: { name: 0, email: 0, phone: 0, url: 0, address: 0 },
  };
  writeFileSync(profilePath, JSON.stringify(profile), "utf-8");
}

async function buildAt(paths: { resumePath: string; piiPath: string; profilePath: string; directoryPath: string }): Promise<ProfileBuildResult> {
  const builder: ProfileBuilder = new ProfileBuilder(
    paths.resumePath,
    new FixedResumeTextExtractor(resumeText()),
    new PiiValueStore(paths.piiPath),
    new SectionSplitter(),
    new PrivateTextFileWriter(),
    {
      profilePath: paths.profilePath,
      redactedTextPath: join(paths.directoryPath, "profile.redacted.txt"),
      reportPath: join(paths.directoryPath, "redaction-report.json"),
    },
  );
  return builder.build();
}

describe("ProfileBuilder", () => {
  afterEach(() => {
    for (let index: number = 0; index < directories.length; index++) {
      rmSync(directories[index], { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("resets approval when the source hash changes", async () => {
    const paths: { directoryPath: string; resumePath: string; piiPath: string; profilePath: string } = writeInputs("resume-bytes-v2");
    writeExistingProfile(paths.profilePath, "old-hash", true);
    const result: ProfileBuildResult = await buildAt(paths);
    const loader: ProfileLoader = new ProfileLoader(paths.profilePath);
    const profile: Profile = loader.parse();
    expect(profile.approved).toBe(false);
    expect(profile.approvedAt).toBeNull();
    expect(profile.sourceFileHash).toBe(hashFile(paths.resumePath));
    expect(profile.sections.summary).toContain("Northwind Labs");
    expect(profile.sections.experience).toContain("Built APIs");
    expect(result.sectionsFound).toContain("summary");
    expect(result.sectionsFound).toContain("experience");

    const redactedPath: string = join(paths.directoryPath, "profile.redacted.txt");
    const redacted: string = readFileSync(redactedPath, "utf-8");
    expect(redacted).not.toContain("jordan.hale@example.com");
    expect(redacted).not.toContain("98765");
    expect(redacted).not.toContain("linkedin.com");
    expect(redacted).not.toContain("Jordan");
    const report: string = readFileSync(join(paths.directoryPath, "redaction-report.json"), "utf-8");
    expect(report).not.toContain("jordan.hale@example.com");
    expect(report).not.toContain("Jordan");

    const profileMode: number = statSync(paths.profilePath).mode & 0o777;
    const redactedMode: number = statSync(redactedPath).mode & 0o777;
    const reportMode: number = statSync(join(paths.directoryPath, "redaction-report.json")).mode & 0o777;
    expect(profileMode).toBe(0o600);
    expect(redactedMode).toBe(0o600);
    expect(reportMode).toBe(0o600);
  });

  it("keeps approval when the source hash is unchanged", async () => {
    const paths: { directoryPath: string; resumePath: string; piiPath: string; profilePath: string } = writeInputs("resume-bytes-same");
    const sameHash: string = hashFile(paths.resumePath);
    writeExistingProfile(paths.profilePath, sameHash, true);
    await buildAt(paths);
    const loader: ProfileLoader = new ProfileLoader(paths.profilePath);
    const profile: Profile = loader.parse();
    expect(profile.approved).toBe(true);
    expect(profile.approvedAt).toBe("2024-02-02T00:00:00.000Z");
    expect(profile.sourceFileHash).toBe(sameHash);
  });
});
