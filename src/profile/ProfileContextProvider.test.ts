import { afterEach, describe, expect, it } from "vitest";
import { PrivateTextFileWriter } from "./PrivateTextFileWriter";
import { ProfileContext, ProfileContextProvider } from "./ProfileContextProvider";
import { ProfileFileHasher } from "./ProfileFileHasher";
import { ProfileLoader } from "./ProfileLoader";
import { SkillsMatrixApprover } from "./SkillsMatrixApprover";
import { SkillsMatrixStore } from "./SkillsMatrixStore";
import { FakeProfileDirectory, fakeMatrix } from "./SkillsMatrixTestSupport";

const directory: FakeProfileDirectory = new FakeProfileDirectory();

function buildProvider(): ProfileContextProvider {
  const store: SkillsMatrixStore = new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter());
  return new ProfileContextProvider(
    new ProfileLoader(directory.profilePath),
    store,
    new ProfileFileHasher(directory.profilePath),
  );
}

function buildStore(): SkillsMatrixStore {
  return new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter());
}

describe("ProfileContextProvider", () => {
  afterEach(() => {
    directory.remove();
  });

  it("throws when the profile is unapproved", () => {
    directory.writeProfile(false, "TypeScript");
    const hash: string = new ProfileFileHasher(directory.profilePath).hash();
    buildStore().save(fakeMatrix(true, hash));
    expect(() => buildProvider().get()).toThrow(/Profile is not approved/);
  });

  it("throws when the matrix is unapproved", () => {
    directory.writeProfile(true, "TypeScript");
    const hash: string = new ProfileFileHasher(directory.profilePath).hash();
    buildStore().save(fakeMatrix(false, hash));
    expect(() => buildProvider().get()).toThrow(/Skills matrix is not approved/);
  });

  it("returns sections and matrix when both are approved", () => {
    directory.writeProfile(true, "TypeScript");
    const hash: string = new ProfileFileHasher(directory.profilePath).hash();
    buildStore().save(fakeMatrix(true, hash));
    const context: ProfileContext = buildProvider().get();
    expect(context.sections.skills).toBe("TypeScript");
    expect(context.matrix.approved).toBe(true);
  });

  it("treats the matrix as unapproved once profile.json changes", () => {
    directory.writeProfile(true, "TypeScript");
    const hash: string = new ProfileFileHasher(directory.profilePath).hash();
    buildStore().save(fakeMatrix(true, hash));
    directory.writeProfile(true, "TypeScript and Go");
    expect(() => buildProvider().get()).toThrow(/out of date/);
  });
});

describe("SkillsMatrixApprover", () => {
  afterEach(() => {
    directory.remove();
  });

  it("approves a matrix that matches the profile", () => {
    directory.writeProfile(true, "TypeScript");
    const hasher: ProfileFileHasher = new ProfileFileHasher(directory.profilePath);
    const store: SkillsMatrixStore = buildStore();
    store.save(fakeMatrix(false, hasher.hash()));
    new SkillsMatrixApprover(store, hasher, () => "2024-05-05T00:00:00.000Z").approve();
    expect(store.load().approved).toBe(true);
    expect(store.load().approvedAt).toBe("2024-05-05T00:00:00.000Z");
  });

  it("refuses to approve a matrix built from an older profile", () => {
    directory.writeProfile(true, "TypeScript");
    const hasher: ProfileFileHasher = new ProfileFileHasher(directory.profilePath);
    const store: SkillsMatrixStore = buildStore();
    store.save(fakeMatrix(false, hasher.hash()));
    directory.writeProfile(true, "Changed");
    const approver: SkillsMatrixApprover = new SkillsMatrixApprover(store, hasher, () => "2024-05-05T00:00:00.000Z");
    expect(() => approver.approve()).toThrow(/does not match/);
  });
});
