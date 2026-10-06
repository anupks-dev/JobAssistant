import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { PiiGuard } from "../llm/PiiGuard";
import { PiiRedactor, RedactionCounts, RedactionResult } from "./PiiRedactor";
import { PiiValueStore, PiiValues } from "./PiiValueStore";
import { PrivateTextFileWriter } from "./PrivateTextFileWriter";
import { Profile, ProfileLoader } from "./ProfileLoader";
import { ResumeTextExtractor } from "./ResumeTextExtractor";
import { ProfileSections, SectionSplitter } from "./SectionSplitter";

export interface ProfileOutputPaths {
  profilePath: string;
  redactedTextPath: string;
  reportPath: string;
}

export interface ProfileBuildResult {
  counts: RedactionCounts;
  sectionsFound: string[];
}

interface ProfileApproval {
  approved: boolean;
  approvedAt: string | null;
}

// Turns a resume into a PII-free profile. Raw extracted text stays in memory.
export class ProfileBuilder {
  public constructor(
    private readonly resumePath: string,
    private readonly extractor: ResumeTextExtractor,
    private readonly piiValueStore: PiiValueStore,
    private readonly sectionSplitter: SectionSplitter,
    private readonly fileWriter: PrivateTextFileWriter,
    private readonly outputPaths: ProfileOutputPaths,
  ) {}

  public async build(): Promise<ProfileBuildResult> {
    const extractedText: string = await this.extractor.extractText();
    const piiValues: PiiValues = this.piiValueStore.load();
    const redactor: PiiRedactor = new PiiRedactor(piiValues);
    const guard: PiiGuard = new PiiGuard(redactor);
    const redaction: RedactionResult = redactor.redact(extractedText);
    const sections: ProfileSections = this.sectionSplitter.split(redaction.redactedText);
    this.assertOutputsClean(guard, redaction.redactedText, sections);

    const sourceFileHash: string = this.readSourceHash();
    const approval: ProfileApproval = this.resolveApproval(sourceFileHash);
    const builtAt: string = new Date().toISOString();
    const profile: Profile = {
      version: 1,
      approved: approval.approved,
      approvedAt: approval.approvedAt,
      sourceFileHash: sourceFileHash,
      builtAt: builtAt,
      sections: sections,
      redactionCounts: redaction.counts,
    };
    const profileText: string = JSON.stringify(profile, null, 2) + "\n";
    const reportText: string = JSON.stringify(redaction.counts, null, 2) + "\n";
    guard.assertClean(profileText);

    this.fileWriter.write(this.outputPaths.redactedTextPath, redaction.redactedText);
    this.fileWriter.write(this.outputPaths.reportPath, reportText);
    this.fileWriter.write(this.outputPaths.profilePath, profileText);

    const result: ProfileBuildResult = {
      counts: redaction.counts,
      sectionsFound: this.listFoundSections(sections),
    };
    return result;
  }

  private assertOutputsClean(guard: PiiGuard, redactedText: string, sections: ProfileSections): void {
    guard.assertClean(redactedText);
    guard.assertClean(sections.summary);
    guard.assertClean(sections.skills);
    guard.assertClean(sections.experience);
    guard.assertClean(sections.education);
    guard.assertClean(sections.projects);
    guard.assertClean(sections.certifications);
    guard.assertClean(sections.other);
  }

  private readSourceHash(): string {
    let bytes: Buffer;
    try {
      bytes = readFileSync(this.resumePath);
    } catch {
      throw new Error("Resume file is missing.");
    }
    const hash: string = createHash("sha256").update(bytes).digest("hex");
    return hash;
  }

  // A new source file has not been reviewed. The same file keeps its previous decision.
  private resolveApproval(sourceFileHash: string): ProfileApproval {
    const existing: Profile | null = this.readExistingProfile();
    if (existing === null || existing.sourceFileHash !== sourceFileHash) {
      const reset: ProfileApproval = { approved: false, approvedAt: null };
      return reset;
    }
    const kept: ProfileApproval = {
      approved: existing.approved,
      approvedAt: existing.approvedAt,
    };
    return kept;
  }

  private readExistingProfile(): Profile | null {
    if (!existsSync(this.outputPaths.profilePath)) {
      return null;
    }
    const loader: ProfileLoader = new ProfileLoader(this.outputPaths.profilePath);
    return loader.parse();
  }

  private listFoundSections(sections: ProfileSections): string[] {
    const found: string[] = [];
    if (sections.summary.trim().length > 0) {
      found.push("summary");
    }
    if (sections.skills.trim().length > 0) {
      found.push("skills");
    }
    if (sections.experience.trim().length > 0) {
      found.push("experience");
    }
    if (sections.education.trim().length > 0) {
      found.push("education");
    }
    if (sections.projects.trim().length > 0) {
      found.push("projects");
    }
    if (sections.certifications.trim().length > 0) {
      found.push("certifications");
    }
    if (sections.other.trim().length > 0) {
      found.push("other");
    }
    return found;
  }
}
