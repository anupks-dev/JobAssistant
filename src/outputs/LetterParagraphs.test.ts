import { describe, expect, it } from "vitest";
import { LetterParagraphs } from "./LetterParagraphs";

const paragraphs: LetterParagraphs = new LetterParagraphs();

describe("LetterParagraphs", () => {
  it("returns the body paragraphs without salutation and sign-off", () => {
    const letter: string = "Dear Hiring Team,\n\nOne.\n\nTwo.\n\nThree.\n\nSincerely,\n{{NAME}}";
    expect(paragraphs.split(letter)).toEqual(["One.", "Two.", "Three."]);
    expect(paragraphs.count(letter)).toBe(3);
  });

  it("copes with a sign-off in the last paragraph and with single line breaks", () => {
    const letter: string = "Dear Hiring Team,\nOne.\n\nTwo.\nSincerely,\n{{NAME}}";
    expect(paragraphs.split(letter)).toEqual(["One.", "Two."]);
  });
});
