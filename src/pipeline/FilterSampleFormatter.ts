export class FilterSampleFormatter {
  public format(id: number, source: string, company: string, title: string, location: string, notes: string): string {
    return String(id) + " | " + source + " | " + company + " | " + title + " | " + location + " | " + notes;
  }
}
