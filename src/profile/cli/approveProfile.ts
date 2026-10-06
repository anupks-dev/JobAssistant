import { Profile, ProfileLoader } from "../ProfileLoader";
import { PrivateTextFileWriter } from "../PrivateTextFileWriter";

// Marks an existing profile as reviewed. Does not print profile contents.
class ApproveProfileCommand {
  public run(): void {
    const profilePath: string = "data/profile.json";
    const loader: ProfileLoader = new ProfileLoader(profilePath);
    const existing: Profile = loader.parse();
    const approvedAt: string = new Date().toISOString();
    const updated: Profile = {
      version: existing.version,
      approved: true,
      approvedAt: approvedAt,
      sourceFileHash: existing.sourceFileHash,
      builtAt: existing.builtAt,
      sections: existing.sections,
      redactionCounts: existing.redactionCounts,
    };
    const fileWriter: PrivateTextFileWriter = new PrivateTextFileWriter();
    const profileText: string = JSON.stringify(updated, null, 2) + "\n";
    fileWriter.write(profilePath, profileText);
    console.log("Reminder: read data/profile.redacted.txt before trusting this profile. Profile marked approved.");
  }
}

const command: ApproveProfileCommand = new ApproveProfileCommand();
try {
  command.run();
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Profile approval failed.";
  console.error(message);
  process.exit(1);
}
