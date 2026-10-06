import { describe, expect, it } from "vitest";
import { TechnologyVocabulary } from "./TechnologyVocabulary";
import { realVocabulary } from "./OutputsTestSupport";

const vocabulary: TechnologyVocabulary = realVocabulary();

describe("TechnologyVocabulary file", () => {
  it("holds about 300 technologies", () => {
    expect(vocabulary.size()).toBeGreaterThanOrEqual(300);
  });
});

describe("TechnologyVocabulary aliases", () => {
  it("treats Postgres and PostgreSQL as the same technology", () => {
    expect(vocabulary.isSameTechnology("Postgres", "PostgreSQL")).toBe(true);
    expect(vocabulary.isSameTechnology("PG", "postgresql")).toBe(true);
  });

  it("treats GCP and Google Cloud Platform as the same technology", () => {
    expect(vocabulary.isSameTechnology("GCP", "Google Cloud Platform")).toBe(true);
  });

  it("knows the other examples", () => {
    expect(vocabulary.isSameTechnology("K8s", "Kubernetes")).toBe(true);
    expect(vocabulary.isSameTechnology("NodeJS", "Node.js")).toBe(true);
    expect(vocabulary.isSameTechnology("Node", "Node.js")).toBe(true);
    expect(vocabulary.isSameTechnology("TS", "TypeScript")).toBe(true);
    expect(vocabulary.isSameTechnology("JS", "JavaScript")).toBe(true);
    expect(vocabulary.isSameTechnology("AWS SQS", "Amazon SQS")).toBe(true);
    expect(vocabulary.isSameTechnology("SQS", "Amazon SQS")).toBe(true);
  });

  it("does not equate different technologies", () => {
    expect(vocabulary.isSameTechnology("Java", "JavaScript")).toBe(false);
    expect(vocabulary.isSameTechnology("AWS", "GCP")).toBe(false);
  });

  it("compares unknown names as plain text", () => {
    expect(vocabulary.isSameTechnology("Code Review", "code  review")).toBe(true);
    expect(vocabulary.isSameTechnology("Code Review", "System Design")).toBe(false);
  });
});

describe("TechnologyVocabulary whole-word matching", () => {
  it("does not find Go inside Google", () => {
    expect(vocabulary.findTerms("We run on Google infrastructure.")).not.toContain("Go");
    expect(vocabulary.findTerms("Services written in Go and Kafka.")).toContain("Go");
  });

  it("matches Go only as a capitalised standalone word", () => {
    expect(vocabulary.findTerms("let us go ahead")).not.toContain("Go");
  });

  it("does not find C in every letter c", () => {
    expect(vocabulary.findTerms("Architecture and cloud practice")).toEqual([]);
    expect(vocabulary.findTerms("Embedded work in C and C++")).toEqual(["C", "C++"]);
  });

  it("does not find C inside C# or C++", () => {
    expect(vocabulary.findTerms("Wrote C# services")).toEqual(["C#"]);
    expect(vocabulary.findTerms("Wrote C++ services")).toEqual(["C++"]);
  });

  it("does not find Java inside JavaScript", () => {
    expect(vocabulary.findTerms("Built UIs in JavaScript")).toEqual(["JavaScript"]);
    expect(vocabulary.findTerms("Java and JavaScript")).toEqual(["Java", "JavaScript"]);
  });

  it("does not find SQL inside PostgreSQL or MySQL", () => {
    expect(vocabulary.findTerms("Tuned PostgreSQL queries")).toEqual(["PostgreSQL"]);
    expect(vocabulary.findTerms("Tuned MySQL queries")).toEqual(["MySQL"]);
    expect(vocabulary.findTerms("Wrote SQL reports")).toEqual(["SQL"]);
  });

  it("matches R only as a standalone capital letter", () => {
    expect(vocabulary.findTerms("Reports and Research")).toEqual([]);
    expect(vocabulary.findTerms("Statistics in R")).toEqual(["R"]);
  });

  it("is case-insensitive and ignores punctuation around the name", () => {
    expect(vocabulary.findTerms("(postgres), kubernetes; and TYPESCRIPT.")).toEqual(["PostgreSQL", "Kubernetes", "TypeScript"]);
  });

  it("returns the canonical name once, and the longest name where names overlap", () => {
    expect(vocabulary.findTerms("Postgres and PostgreSQL")).toEqual(["PostgreSQL"]);
    expect(vocabulary.findTerms("Used AWS SQS queues")).toEqual(["Amazon SQS"]);
    expect(vocabulary.findTerms("Spring Boot on Node.js")).toEqual(["Spring Boot", "Node.js"]);
  });

  it("keeps ordinary English words out", () => {
    expect(vocabulary.findTerms("Fast and swift delivery with the rest of the team, then express shipping")).toEqual([]);
  });
});

describe("TechnologyVocabulary mentions", () => {
  it("finds a technology under any of its aliases", () => {
    expect(vocabulary.mentions("Strong PostgreSQL skills", "Postgres")).toBe(true);
    expect(vocabulary.mentions("Worked with GCP", "Google Cloud Platform")).toBe(true);
    expect(vocabulary.mentions("Worked with AWS", "Google Cloud Platform")).toBe(false);
  });

  it("matches unknown terms as plain whole words", () => {
    expect(vocabulary.mentions("Led Code Review sessions", "Code Review")).toBe(true);
    expect(vocabulary.mentions("Led Code Reviewing sessions", "Code Review")).toBe(false);
  });
});

describe("TechnologyVocabulary parsing", () => {
  it("skips comments and blank lines and supports the case-sensitive prefix", () => {
    const small: TechnologyVocabulary = new TechnologyVocabulary(["# comment", "", "=Echo", "Zig|Ziglang"]);
    expect(small.size()).toBe(2);
    expect(small.findTerms("echo and ziglang")).toEqual(["Zig"]);
    expect(small.findTerms("Echo")).toEqual(["Echo"]);
  });
});
