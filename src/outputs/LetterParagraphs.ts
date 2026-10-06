import { NAME_PLACEHOLDER, SALUTATION } from "./LetterMarkers";

// Splits a letter into its body paragraphs, without the salutation line and the sign-off.
export class LetterParagraphs {
  public split(letter: string): string[] {
    let body: string = letter.trim();
    if (body.startsWith(SALUTATION)) {
      body = body.slice(SALUTATION.length);
    }
    body = this.removeSignOff(body);
    const paragraphs: string[] = [];
    const blocks: string[] = body.split(/\n\s*\n/);
    for (let index: number = 0; index < blocks.length; index++) {
      const trimmed: string = blocks[index].trim();
      if (trimmed.length > 0) {
        paragraphs.push(trimmed);
      }
    }
    return paragraphs;
  }

  public count(letter: string): number {
    return this.split(letter).length;
  }

  // Drops the line holding {{NAME}} and the closing phrase line above it ("Sincerely,").
  private removeSignOff(body: string): string {
    const lines: string[] = body.split("\n");
    let nameLine: number = -1;
    for (let index: number = 0; index < lines.length; index++) {
      if (lines[index].indexOf(NAME_PLACEHOLDER) >= 0) {
        nameLine = index;
      }
    }
    if (nameLine < 0) {
      return body;
    }
    let cut: number = nameLine;
    if (cut > 0 && /^[A-Za-z ]{1,30},\s*$/.test(lines[cut - 1])) {
      cut = cut - 1;
    }
    return lines.slice(0, cut).join("\n");
  }
}
