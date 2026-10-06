import { ProfileFileHasher } from "./ProfileFileHasher";
import { SkillsMatrix } from "./SkillsMatrix";
import { SkillsMatrixStore } from "./SkillsMatrixStore";

// Marks a reviewed matrix as approved, but only if it still matches the current profile.json.
export class SkillsMatrixApprover {
  public constructor(
    private readonly matrixStore: SkillsMatrixStore,
    private readonly hasher: ProfileFileHasher,
    private readonly nowIso: () => string,
  ) {}

  public approve(): void {
    const existing: SkillsMatrix = this.matrixStore.load();
    if (existing.profileHash !== this.hasher.hash()) {
      throw new Error("Skills matrix does not match the current profile.json. Run pnpm profile:skills again.");
    }
    const approved: SkillsMatrix = {
      ...existing,
      approved: true,
      approvedAt: this.nowIso(),
    };
    this.matrixStore.save(approved);
  }
}
