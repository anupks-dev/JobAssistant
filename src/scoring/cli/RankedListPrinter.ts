import { RankedJob } from "../RankingService";

// Plain console lines: rank, section, score, company, title and, on request, the job URL. No descriptions and no profile text.
export class RankedListPrinter {
  public lines(ranked: RankedJob[], includeUrls: boolean): string[] {
    const lines: string[] = [];
    lines.push("Rank  Section  Score  Id  Company | Title" + (includeUrls ? " | URL" : ""));
    for (let index: number = 0; index < ranked.length; index++) {
      const entry: RankedJob = ranked[index];
      const score: number = entry.job.score ?? 0;
      lines.push(
        this.pad(String(entry.rank), 6)
        + this.pad(entry.section, 9)
        + this.pad(String(score), 7)
        + this.pad(String(entry.job.id), 4)
        + entry.job.company + " | " + entry.job.title + (includeUrls ? " | " + entry.job.url : ""),
      );
    }
    if (ranked.length === 0) {
      lines.push("(no scored jobs in the ranking window)");
    }
    return lines;
  }

  private pad(text: string, width: number): string {
    let padded: string = text;
    while (padded.length < width) {
      padded = padded + " ";
    }
    return padded;
  }
}
