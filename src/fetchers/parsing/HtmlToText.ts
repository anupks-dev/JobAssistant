import { CheerioAPI, load } from "cheerio";

const MAXIMUM_TEXT_LENGTH: number = 20000;

// Job HTML is untrusted. Stored descriptions are plain text with a hard length cap.
export class HtmlToText {
  public toPlainText(value: string): string {
    const decoded: string = this.decodeEntities(value);
    const document: CheerioAPI = load(decoded);
    document("script").remove();
    document("style").remove();
    const rawText: string = document.root().text();
    const collapsed: string = rawText.replace(/\s+/g, " ").trim();
    if (collapsed.length <= MAXIMUM_TEXT_LENGTH) {
      return collapsed;
    }
    return collapsed.slice(0, MAXIMUM_TEXT_LENGTH);
  }

  // Some feeds store tags as &lt;p&gt; inside JSON. Decode before Cheerio sees them as text.
  private decodeEntities(value: string): string {
    let current: string = value;
    for (let pass: number = 0; pass < 2; pass++) {
      const decoded: string = this.decodeOnce(current);
      if (decoded === current) {
        return current;
      }
      current = decoded;
    }
    return current;
  }

  private decodeOnce(value: string): string {
    let decoded: string = value.replace(/&#(\d+);/g, (_match: string, digits: string): string => {
      return String.fromCodePoint(Number(digits));
    });
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_match: string, hex: string): string => {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    });
    decoded = decoded.replace(/&nbsp;/gi, " ");
    decoded = decoded.replace(/&quot;/gi, "\"");
    decoded = decoded.replace(/&#39;|&apos;/gi, "'");
    decoded = decoded.replace(/&lt;/gi, "<");
    decoded = decoded.replace(/&gt;/gi, ">");
    decoded = decoded.replace(/&amp;/gi, "&");
    return decoded;
  }
}
