import { ProfileSections } from "./SectionSplitter";

interface SectionHeading {
  heading: string;
  text: string;
}

// Turns the PII-free profile sections into one block of prompt text.
export class ProfileTextFormatter {
  public format(sections: ProfileSections): string {
    const parts: SectionHeading[] = [
      { heading: "Summary", text: sections.summary },
      { heading: "Skills", text: sections.skills },
      { heading: "Experience", text: sections.experience },
      { heading: "Education", text: sections.education },
      { heading: "Projects", text: sections.projects },
      { heading: "Certifications", text: sections.certifications },
      { heading: "Other", text: sections.other },
    ];
    let formatted: string = "";
    for (let index: number = 0; index < parts.length; index++) {
      const part: SectionHeading = parts[index];
      const body: string = part.text.trim();
      if (body.length === 0) {
        continue;
      }
      if (formatted.length > 0) {
        formatted = formatted + "\n\n";
      }
      formatted = formatted + "## " + part.heading + "\n" + body;
    }
    return formatted;
  }
}
