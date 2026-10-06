import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptLoader } from "./PromptLoader";

describe("PromptLoader", () => {
  let directory: string = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "prompts-"));
    writeFileSync(join(directory, "demo.txt"), "version: 3\nHello {{name}}, role {{role}}.", "utf-8");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads the version and fills placeholders", () => {
    const loader: PromptLoader = new PromptLoader(directory);
    expect(loader.getVersion("demo")).toBe("3");
    expect(loader.render("demo", { name: "A", role: "B" })).toBe("Hello A, role B.");
  });

  it("raises clear errors for missing placeholders and templates", () => {
    const loader: PromptLoader = new PromptLoader(directory);
    expect(() => loader.render("demo", { name: "A" })).toThrow("unreplaced placeholders");
    expect(() => loader.render("demo", { name: "A", role: "B", extra: "C" })).toThrow("placeholder is missing");
    expect(() => loader.render("absent", {})).toThrow("Prompt template is missing");
  });

  it("rejects a template without a version line", () => {
    writeFileSync(join(directory, "bad.txt"), "no version here", "utf-8");
    expect(() => new PromptLoader(directory)).toThrow("version line");
  });

  it("keeps declared literal tokens such as {{NAME}} and still rejects other leftovers", () => {
    writeFileSync(join(directory, "letter.txt"), "version: 1\nSign as {{NAME}}. Job: {{job}}. Also {{OTHER}}.", "utf-8");
    const loader: PromptLoader = new PromptLoader(directory);
    expect(() => loader.render("letter", { job: "X" }, ["{{NAME}}"])).toThrow("unreplaced placeholders");
    writeFileSync(join(directory, "letter2.txt"), "version: 1\nSign as {{NAME}}. Job: {{job}}.", "utf-8");
    const second: PromptLoader = new PromptLoader(directory);
    expect(second.render("letter2", { job: "X" }, ["{{NAME}}"])).toBe("Sign as {{NAME}}. Job: X.");
  });
});
