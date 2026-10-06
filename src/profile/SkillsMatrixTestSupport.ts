import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SkillsMatrix } from "./SkillsMatrix";

// Fake data only. Builds a temp directory holding a fake profile.json.
export class FakeProfileDirectory {
  public readonly directoryPath: string = mkdtempSync(join(tmpdir(), "jobagent-skills-"));
  public readonly profilePath: string = join(this.directoryPath, "profile.json");
  public readonly matrixPath: string = join(this.directoryPath, "skills-matrix.json");

  public writeProfile(approved: boolean, skillsText: string): void {
    const profile: object = {
      version: 1,
      approved: approved,
      approvedAt: approved ? "2024-01-01T00:00:00.000Z" : null,
      sourceFileHash: "abc123",
      builtAt: "2024-01-01T00:00:00.000Z",
      sections: {
        summary: "Backend engineer at Northwind Labs.",
        skills: skillsText,
        experience: "Northwind Labs, 2016 to 2024",
        education: "",
        projects: "",
        certifications: "",
        other: "",
      },
      redactionCounts: { name: 0, email: 0, phone: 0, url: 0, address: 0 },
    };
    mkdirSync(this.directoryPath, { recursive: true });
    writeFileSync(this.profilePath, JSON.stringify(profile), "utf-8");
  }

  public remove(): void {
    rmSync(this.directoryPath, { recursive: true, force: true });
  }
}

export function fakeMatrix(approved: boolean, profileHash: string): SkillsMatrix {
  const matrix: SkillsMatrix = {
    version: 1,
    approved: approved,
    approvedAt: approved ? "2024-01-02T00:00:00.000Z" : null,
    profileHash: profileHash,
    yearsExperience: 8,
    currentLevel: "Senior",
    targetRoles: ["Backend Engineer"],
    mustHave: ["TypeScript"],
    niceToHave: ["Kubernetes"],
    avoid: ["Data Engineer"],
    strengths: ["API design"],
  };
  return matrix;
}
