import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface LoadedPrompt {
  version: string;
  template: string;
}

// Loads prompt templates from disk at startup for versioned, editable prompts.
export class PromptLoader {
  private readonly prompts: Map<string, LoadedPrompt> = new Map<string, LoadedPrompt>();

  public constructor(promptsDirectory: string) {
    this.loadDirectory(promptsDirectory);
  }

  public render(name: string, placeholders: Record<string, string>): string {
    const prompt: LoadedPrompt | undefined = this.prompts.get(name);
    if (prompt === undefined) {
      throw new Error("Prompt template is missing: " + name);
    }
    let rendered: string = prompt.template;
    const keys: string[] = Object.keys(placeholders);
    for (let index: number = 0; index < keys.length; index++) {
      const key: string = keys[index];
      const token: string = "{{" + key + "}}";
      if (rendered.indexOf(token) < 0) {
        throw new Error("Prompt placeholder is missing from template: " + key);
      }
      rendered = rendered.split(token).join(placeholders[key]);
    }
    if (rendered.indexOf("{{") >= 0) {
      throw new Error("Prompt template still has unreplaced placeholders.");
    }
    return rendered;
  }

  public getVersion(name: string): string {
    const prompt: LoadedPrompt | undefined = this.prompts.get(name);
    if (prompt === undefined) {
      throw new Error("Prompt template is missing: " + name);
    }
    return prompt.version;
  }

  private loadDirectory(promptsDirectory: string): void {
    let entries: string[] = [];
    try {
      entries = readdirSync(promptsDirectory);
    } catch {
      return;
    }
    for (let index: number = 0; index < entries.length; index++) {
      const entry: string = entries[index];
      if (!entry.endsWith(".txt")) {
        continue;
      }
      const filePath: string = join(promptsDirectory, entry);
      const fileText: string = readFileSync(filePath, "utf-8");
      const loaded: LoadedPrompt = this.parsePrompt(fileText);
      const name: string = entry.slice(0, entry.length - ".txt".length);
      this.prompts.set(name, loaded);
    }
  }

  private parsePrompt(fileText: string): LoadedPrompt {
    const lines: string[] = fileText.split("\n");
    if (lines.length === 0) {
      throw new Error("Prompt file is empty.");
    }
    const versionLine: string = lines[0].trim();
    if (!versionLine.startsWith("version:")) {
      throw new Error("Prompt file must start with a version line.");
    }
    const version: string = versionLine.slice("version:".length).trim();
    const template: string = lines.slice(1).join("\n").trimStart();
    const loaded: LoadedPrompt = {
      version: version,
      template: template,
    };
    return loaded;
  }
}
