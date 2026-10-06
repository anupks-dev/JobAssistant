import { Profile, ProfileLoader } from "./ProfileLoader";
import { ProfileFileHasher } from "./ProfileFileHasher";
import { SkillsMatrix } from "./SkillsMatrix";
import { SkillsMatrixStore } from "./SkillsMatrixStore";
import { ProfileSections } from "./SectionSplitter";

export interface ProfileContext {
  sections: ProfileSections;
  matrix: SkillsMatrix;
}

// The one place later stages get profile data from. Refuses anything not approved.
export class ProfileContextProvider {
  public constructor(
    private readonly profileLoader: ProfileLoader,
    private readonly matrixStore: SkillsMatrixStore,
    private readonly hasher: ProfileFileHasher,
  ) {}

  public get(): ProfileContext {
    const profile: Profile = this.profileLoader.load();
    const matrix: SkillsMatrix = this.matrixStore.load();
    if (!matrix.approved) {
      throw new Error("Skills matrix is not approved. Review data/skills-matrix.json, then run pnpm profile:skills:approve.");
    }
    if (matrix.profileHash !== this.hasher.hash()) {
      throw new Error("Skills matrix is out of date because profile.json changed. Run pnpm profile:skills again.");
    }
    const context: ProfileContext = {
      sections: profile.sections,
      matrix: matrix,
    };
    return context;
  }
}
