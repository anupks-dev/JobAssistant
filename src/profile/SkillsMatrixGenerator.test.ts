import { afterEach, describe, expect, it } from "vitest";
import { JsonExtractor } from "../llm/JsonExtractor";
import { LlmResult } from "../llm/LlmClient";
import { PromptLoader } from "../llm/PromptLoader";
import { StructuredCompletion } from "../llm/StructuredCompletion";
import { FakeLlmClient, MutableClock } from "../llm/testing/LlmTestSupport";
import { ProfileFileHasher } from "./ProfileFileHasher";
import { ProfileLoader } from "./ProfileLoader";
import { ProfileTextFormatter } from "./ProfileTextFormatter";
import { SkillsMatrix } from "./SkillsMatrix";
import { SkillsMatrixGenerator, SkillsMatrixSettings } from "./SkillsMatrixGenerator";
import { FakeProfileDirectory } from "./SkillsMatrixTestSupport";

const directory: FakeProfileDirectory = new FakeProfileDirectory();

function reply(text: string): LlmResult {
  return { text: text, modelUsed: "fake/model", latencyMs: 1, usedFallback: false, hadReasoningContent: false };
}

function buildGenerator(fake: FakeLlmClient): SkillsMatrixGenerator {
  const settings: SkillsMatrixSettings = {
    excludeRoles: ["Data Engineer", "ML Engineer"],
    temperature: 0.2,
    maxTokens: 1200,
    fallbackModelAvailable: false,
  };
  return new SkillsMatrixGenerator(
    new ProfileLoader(directory.profilePath),
    new ProfileFileHasher(directory.profilePath),
    new ProfileTextFormatter(),
    new PromptLoader("prompts"),
    new StructuredCompletion(fake, new JsonExtractor()),
    settings,
  );
}

function newFake(): FakeLlmClient {
  return new FakeLlmClient(new MutableClock(new Date("2026-01-01T00:00:00Z")));
}

const VALID_REPLY: string = JSON.stringify({
  version: 1,
  approved: true,
  approvedAt: "2020-01-01T00:00:00.000Z",
  profileHash: "made-up",
  yearsExperience: 8,
  currentLevel: "Senior",
  targetRoles: ["Backend Engineer"],
  mustHave: ["TypeScript"],
  niceToHave: ["Kubernetes"],
  avoid: ["data engineer", "Sales"],
  strengths: ["API design"],
});

describe("SkillsMatrixGenerator", () => {
  afterEach(() => {
    directory.remove();
  });

  it("builds an unapproved matrix with our own hash, whatever the model claims", async () => {
    directory.writeProfile(true, "TypeScript");
    const fake: FakeLlmClient = newFake();
    fake.queueResult(reply("```json\n" + VALID_REPLY + "\n```"));
    const matrix: SkillsMatrix = await buildGenerator(fake).generate();
    expect(matrix.approved).toBe(false);
    expect(matrix.approvedAt).toBeNull();
    expect(matrix.profileHash).toBe(new ProfileFileHasher(directory.profilePath).hash());
    expect(matrix.yearsExperience).toBe(8);
  });

  it("prefills avoid from config roles without duplicates", async () => {
    directory.writeProfile(true, "TypeScript");
    const fake: FakeLlmClient = newFake();
    fake.queueResult(reply(VALID_REPLY));
    const matrix: SkillsMatrix = await buildGenerator(fake).generate();
    expect(matrix.avoid).toEqual(["Data Engineer", "ML Engineer", "Sales"]);
  });

  it("sends only the profile text and the prompt rules", async () => {
    directory.writeProfile(true, "TypeScript");
    const fake: FakeLlmClient = newFake();
    fake.queueResult(reply(VALID_REPLY));
    await buildGenerator(fake).generate();
    const prompt: string = fake.calls[0].request.userPrompt;
    expect(prompt).toContain("<profile>");
    expect(prompt).toContain("## Skills\nTypeScript");
    expect(prompt).toContain("Use only facts present in the profile");
    expect(prompt).toContain("Reply with JSON only");
    expect(prompt).toContain("Data Engineer, ML Engineer");
    expect(fake.calls[0].request.taskName).toBe("skillsMatrix");
  });

  it("refuses an unapproved profile and makes no LLM call", async () => {
    directory.writeProfile(false, "TypeScript");
    const fake: FakeLlmClient = newFake();
    await expect(buildGenerator(fake).generate()).rejects.toThrow(/not approved/);
    expect(fake.calls.length).toBe(0);
  });

  it("throws a typed failure message when the model never returns valid JSON", async () => {
    directory.writeProfile(true, "TypeScript");
    const fake: FakeLlmClient = newFake();
    fake.queueResult(reply("no json here"));
    fake.queueResult(reply("still none"));
    await expect(buildGenerator(fake).generate()).rejects.toThrow(/generation failed \(parse\)/);
  });
});

describe("skills-matrix prompt file", () => {
  it("starts with version: 1", () => {
    const loader: PromptLoader = new PromptLoader("prompts");
    expect(loader.getVersion("skills-matrix")).toBe("1");
  });
});
