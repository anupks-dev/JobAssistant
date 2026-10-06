import mammoth from "mammoth";

// Reads a DOCX resume into memory. The plain text is never written to disk.
export class ResumeTextExtractor {
  public constructor(private readonly resumePath: string) {}

  public async extractText(): Promise<string> {
    try {
      const result: { value: string } = await mammoth.extractRawText({ path: this.resumePath });
      const text: string = result.value;
      return text;
    } catch {
      // Mammoth errors can quote document text, so the message stays generic.
      throw new Error("Could not read the resume document.");
    }
  }
}
