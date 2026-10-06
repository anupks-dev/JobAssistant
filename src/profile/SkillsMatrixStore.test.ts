import { statSync } from "fs";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateTextFileWriter } from "./PrivateTextFileWriter";
import { SkillsMatrix } from "./SkillsMatrix";
import { SkillsMatrixStore } from "./SkillsMatrixStore";
import { FakeProfileDirectory, fakeMatrix } from "./SkillsMatrixTestSupport";

const directory: FakeProfileDirectory = new FakeProfileDirectory();

describe("SkillsMatrixStore", () => {
  afterEach(() => {
    directory.remove();
  });

  it("writes the matrix with mode 600 and reads it back", () => {
    const store: SkillsMatrixStore = new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter());
    store.save(fakeMatrix(false, "hash-1"));
    const mode: number = statSync(directory.matrixPath).mode & 0o777;
    const loaded: SkillsMatrix = store.load();
    expect(mode).toBe(0o600);
    expect(loaded.approved).toBe(false);
    expect(loaded.profileHash).toBe("hash-1");
  });

  it("throws a clear error when the file is missing", () => {
    const store: SkillsMatrixStore = new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter());
    expect(() => store.load()).toThrow(/missing/);
  });
});
