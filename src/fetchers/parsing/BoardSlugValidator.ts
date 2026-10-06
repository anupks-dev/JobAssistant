const SLUG_PATTERN: RegExp = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export class BoardSlugValidator {
  public isValid(slug: string): boolean {
    return SLUG_PATTERN.test(slug);
  }
}
