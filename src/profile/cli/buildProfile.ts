import pino, { Logger } from "pino";
import { PiiValueStore } from "../PiiValueStore";
import { PrivateTextFileWriter } from "../PrivateTextFileWriter";
import { ProfileBuilder, ProfileBuildResult, ProfileOutputPaths } from "../ProfileBuilder";
import { ResumeTextExtractor } from "../ResumeTextExtractor";
import { SectionSplitter } from "../SectionSplitter";

// Builds the PII-free profile. Prints counts and section names, never resume text.
class BuildProfileCommand {
  private readonly logger: Logger = pino({ level: "info" });

  public async run(): Promise<void> {
    const resumePath: string = "data/resume.docx";
    const extractor: ResumeTextExtractor = new ResumeTextExtractor(resumePath);
    const piiValueStore: PiiValueStore = new PiiValueStore("data/pii-values.json");
    const sectionSplitter: SectionSplitter = new SectionSplitter();
    const fileWriter: PrivateTextFileWriter = new PrivateTextFileWriter();
    const outputPaths: ProfileOutputPaths = {
      profilePath: "data/profile.json",
      redactedTextPath: "data/profile.redacted.txt",
      reportPath: "data/redaction-report.json",
    };
    const builder: ProfileBuilder = new ProfileBuilder(
      resumePath,
      extractor,
      piiValueStore,
      sectionSplitter,
      fileWriter,
      outputPaths,
    );
    const result: ProfileBuildResult = await builder.build();
    this.logger.info({ counts: result.counts, sections: result.sectionsFound }, "Profile built");
    console.log(
      "Redaction counts: name=" + result.counts.name
      + " email=" + result.counts.email
      + " phone=" + result.counts.phone
      + " url=" + result.counts.url
      + " address=" + result.counts.address,
    );
    console.log("Sections found: " + result.sectionsFound.join(", "));
  }
}

const command: BuildProfileCommand = new BuildProfileCommand();
command.run().catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Profile build failed.";
  console.error(message);
  process.exit(1);
});
