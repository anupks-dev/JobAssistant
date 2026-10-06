import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";

// Hashes profile.json as stored, so any change to it (including a rebuild) is detected.
export class ProfileFileHasher {
  public constructor(private readonly profilePath: string) {}

  public hash(): string {
    if (!existsSync(this.profilePath)) {
      throw new Error("Profile file is missing.");
    }
    const bytes: Buffer = readFileSync(this.profilePath);
    const hash: string = createHash("sha256").update(bytes).digest("hex");
    return hash;
  }
}
