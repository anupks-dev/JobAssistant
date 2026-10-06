const SPACED_DASHES: string[] = [" - ", " – ", " — "];

export class TitlePrimarySegment {
  public extract(title: string): string {
    let end: number = title.length;
    const comma: number = title.indexOf(",");
    if (comma >= 0 && comma < end) {
      end = comma;
    }
    const colon: number = title.indexOf(":");
    if (colon >= 0 && colon < end) {
      end = colon;
    }
    const pipe: number = title.indexOf("|");
    if (pipe >= 0 && pipe < end) {
      end = pipe;
    }
    const parenthesis: number = title.indexOf("(");
    if (parenthesis >= 0 && parenthesis < end) {
      end = parenthesis;
    }
    for (let index: number = 0; index < SPACED_DASHES.length; index++) {
      const dash: number = title.indexOf(SPACED_DASHES[index]);
      if (dash >= 0 && dash < end) {
        end = dash;
      }
    }
    const segment: string = title.slice(0, end).trim();
    return segment;
  }
}
