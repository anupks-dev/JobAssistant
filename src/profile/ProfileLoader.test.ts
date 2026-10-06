import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileLoader } from "./ProfileLoader";

const directories: string[] = [];

function writeProfile(approved: boolean): string {
  const directoryPath: string = mkdtempSync(join(tmpdir(), "jobagent-profile-"));
  directories.push(directoryPath);
  const profilePath: string = join(directoryPath, "profile.json");
  const profile: object = {
    version: 1,
    approved: approved,
    approvedAt: approved ? "2024-01-01T00:00:00.000Z" : null,
    sourceFileHash: "abc123",
    builtAt: "2024-01-01T00:00:00.000Z",
    sections: {
      summary: "",
      skills: "TypeScript",
      experience: "Northwind Labs",
      education: "",
      projects: "",
      certifications: "",
      other: "",
    },
    redactionCounts: { name: 0, email: 0, phone: 0, url: 0, address: 0 },
  };
  writeFileSync(profilePath, JSON.stringify(profile), "utf-8");
  return profilePath;
}

describe("ProfileLoader", () => {
  afterEach(() => {
    for (let index: number = 0; index < directories.length; index++) {
      rmSync(directories[index], { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("throws when the profile is unapproved", () => {
    const profilePath: string = writeProfile(false);
    const loader: ProfileLoader = new ProfileLoader(profilePath);
    expect(() => loader.load()).toThrow(/not approved/);
  });

  it("returns the profile after it has been approved", () => {
    const profilePath: string = writeProfile(true);
    const loader: ProfileLoader = new ProfileLoader(profilePath);
    expect(loader.load().approved).toBe(true);
    expect(loader.load().sections.experience).toBe("Northwind Labs");
  });
});
