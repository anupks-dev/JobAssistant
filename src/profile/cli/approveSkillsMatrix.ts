import { PrivateTextFileWriter } from "../PrivateTextFileWriter";
import { ProfileFileHasher } from "../ProfileFileHasher";
import { SkillsMatrixApprover } from "../SkillsMatrixApprover";
import { SkillsMatrixStore } from "../SkillsMatrixStore";

// Marks data/skills-matrix.json as reviewed. Does not print its contents.
class ApproveSkillsMatrixCommand {
  public run(): void {
    const store: SkillsMatrixStore = new SkillsMatrixStore("data/skills-matrix.json", new PrivateTextFileWriter());
    const hasher: ProfileFileHasher = new ProfileFileHasher("data/profile.json");
    const approver: SkillsMatrixApprover = new SkillsMatrixApprover(store, hasher, () => new Date().toISOString());
    approver.approve();
    console.log("Skills matrix marked approved.");
  }
}

try {
  new ApproveSkillsMatrixCommand().run();
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Skills matrix approval failed.";
  console.error(message);
  process.exit(1);
}
