export class FilterSampleQuery {
  public constructor(
    public readonly reason: string | null,
    public readonly shortlisted: boolean,
    public readonly limit: number,
    public readonly source: string | null,
    public readonly offset: number,
  ) {}
}

export class FilterSampleQueryReader {
  public read(argv: string[]): FilterSampleQuery {
    let reason: string | null = null;
    let shortlisted: boolean = false;
    let limit: number = 20;
    let source: string | null = null;
    let offset: number = 0;
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (this.isFlag(argument, "--shortlisted")) {
        shortlisted = true;
        continue;
      }
      const reasonValue: string | null = this.readPrefixed(argument, "--reason=");
      if (reasonValue !== null) {
        reason = reasonValue;
        continue;
      }
      const sourceValue: string | null = this.readPrefixed(argument, "--source=");
      if (sourceValue !== null) {
        source = sourceValue;
        continue;
      }
      const limitValue: string | null = this.readPrefixed(argument, "--limit=");
      if (limitValue !== null) {
        limit = this.parsePositive(limitValue, "--limit=");
        continue;
      }
      const offsetValue: string | null = this.readPrefixed(argument, "--offset=");
      if (offsetValue !== null) {
        offset = this.parseOffset(offsetValue);
        continue;
      }
      throw new Error("Unknown or malformed option: " + argument);
    }
    if (reason === null && !shortlisted) {
      throw new Error("Provide --reason=<code> or --shortlisted.");
    }
    const query: FilterSampleQuery = new FilterSampleQuery(reason, shortlisted, limit, source, offset);
    return query;
  }

  private isFlag(argument: string, flag: string): boolean {
    return argument === flag;
  }

  private readPrefixed(argument: string, prefix: string): string | null {
    if (argument.indexOf(prefix) !== 0) {
      return null;
    }
    const value: string = argument.slice(prefix.length);
    if (value.length === 0) {
      throw new Error("Missing value for " + prefix.slice(0, prefix.length - 1) + ".");
    }
    if (value.indexOf("--") >= 0) {
      throw new Error("Malformed option value: " + argument);
    }
    return value;
  }

  private parsePositive(raw: string, label: string): number {
    const parsed: number = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error("Invalid " + label + " value: " + raw);
    }
    return Math.floor(parsed);
  }

  private parseOffset(raw: string): number {
    const parsed: number = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("Invalid --offset= value: " + raw);
    }
    return Math.floor(parsed);
  }
}
