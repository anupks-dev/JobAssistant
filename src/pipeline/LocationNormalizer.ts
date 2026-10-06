import { PhraseMatcher } from "./PhraseMatcher";

export class LocationNormalizer {
  public constructor(private readonly phrases: PhraseMatcher) {}

  public normalize(value: string): string {
    const collapsed: string = this.phrases.normalize(value);
    return collapsed.replace(/\bbengaluru\b/g, "bangalore");
  }
}
