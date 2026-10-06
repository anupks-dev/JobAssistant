import { GroundingChecker } from "./GroundingChecker";
import { TechnologyVocabulary } from "./TechnologyVocabulary";
import { LlmResult } from "../llm/LlmClient";
import { PiiGuard } from "../llm/PiiGuard";
import { PiiRedactor } from "../profile/PiiRedactor";
import { ProfileContext } from "../profile/ProfileContextProvider";
import { fakeMatrix } from "../profile/SkillsMatrixTestSupport";

// Fake data only.
export function fakePiiGuard(): PiiGuard {
  return new PiiGuard(new PiiRedactor({
    fullName: "Jane Q Fakeperson",
    alternateNames: [],
    emails: [],
    phones: [],
    addresses: [],
    otherValues: [],
  }));
}

export function fakeContext(): ProfileContext {
  const context: ProfileContext = {
    sections: {
      summary: "Backend engineer at Northwind Labs.",
      skills: "TypeScript, Node.js",
      experience: "Northwind Labs, 2016 to 2024",
      education: "",
      projects: "",
      certifications: "",
      other: "",
    },
    matrix: fakeMatrix(true, "hash"),
  };
  return context;
}

export function llmReply(text: string): LlmResult {
  return { text: text, modelUsed: "fake/model", latencyMs: 1, usedFallback: false, hadReasoningContent: false };
}

// A valid letter with exactly the requested total word count (salutation and sign-off included).
export function letterWithWords(totalWords: number): string {
  const head: string = "Dear Hiring Team,";
  const tail: string = "Sincerely,\n{{NAME}}";
  const fixedWords: number = 3 + 1 + 1;
  const body: string[] = [];
  for (let index: number = 0; index < totalWords - fixedWords; index++) {
    body.push("word");
  }
  return head + "\n" + body.join(" ") + "\n" + tail;
}

// Appears in the fake profile of fakeContext and of FakeProfileDirectory.
export const GROUNDED_EXCERPT: string = "Backend engineer at Northwind Labs";

export function tweaksJson(count: number, wordsPerSuggestion: number): string {
  const words: string[] = [];
  for (let index: number = 0; index < wordsPerSuggestion; index++) {
    words.push("emphasize");
  }
  const tweaks: object[] = [];
  for (let index: number = 0; index < count; index++) {
    tweaks.push({ section: "Skills", suggestion: words.join(" "), reason: "Matches the posting.", basedOn: GROUNDED_EXCERPT });
  }
  return JSON.stringify({ tweaks: tweaks });
}

// The real vocabulary file holds technology names only, so tests can load it.
export function realVocabulary(): TechnologyVocabulary {
  return TechnologyVocabulary.fromFile("resources/technologies.txt");
}

export const DEFAULT_TEST_DOMAIN_TERMS: string[] = [
  "financial", "finance", "banking", "bank", "fintech", "trading", "insurance", "healthcare", "government",
  "defense", "defence", "telecom", "retail", "e-commerce", "logistics", "aviation",
];

export function fakeGroundingChecker(): GroundingChecker {
  return new GroundingChecker(realVocabulary(), DEFAULT_TEST_DOMAIN_TERMS);
}
