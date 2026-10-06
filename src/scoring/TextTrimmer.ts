const ELLIPSIS: string = "…";

// Shortens text to a limit at a word boundary and marks the cut with an ellipsis.
// The result, ellipsis included, is never longer than the limit.
export class TextTrimmer {
  public trim(text: string, limit: number): string {
    if (text.length <= limit) {
      return text;
    }
    const room: number = limit - ELLIPSIS.length;
    const cut: string = text.slice(0, room);
    const nextCharacter: string = text.charAt(room);
    let kept: string = cut;
    // Only back off to the last space when the cut landed inside a word.
    if (nextCharacter !== " ") {
      const lastSpace: number = cut.lastIndexOf(" ");
      if (lastSpace > 0) {
        kept = cut.slice(0, lastSpace);
      }
    }
    const cleaned: string = kept.replace(/[\s,;:.\-]+$/, "");
    return cleaned + ELLIPSIS;
  }
}
