import { FilterRunSummary, ReasonCount, SourceReasonCount } from "../FilterPipelineRunner";

export class FilterSummaryPrinter {
  public lines(summary: FilterRunSummary): string[] {
    const lines: string[] = [];
    lines.push("evaluated=" + String(summary.evaluated));
    lines.push("shortlisted=" + String(summary.shortlisted));
    lines.push("capped=" + String(summary.capped));
    for (let index: number = 0; index < summary.rejectedByReason.length; index++) {
      const reason: ReasonCount = summary.rejectedByReason[index];
      lines.push(reason.reason + "=" + String(reason.count));
    }
    lines.push("source | reason | count");
    for (let index: number = 0; index < summary.bySource.length; index++) {
      const row: SourceReasonCount = summary.bySource[index];
      lines.push(row.source + " | " + row.reason + " | " + String(row.count));
    }
    return lines;
  }
}
