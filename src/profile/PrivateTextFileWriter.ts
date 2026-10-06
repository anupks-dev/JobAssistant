import { chmodSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

// Profile files still describe one person, so they must not be group-readable.
export class PrivateTextFileWriter {
  public write(filePath: string, contents: string): void {
    const directoryPath: string = dirname(filePath);
    mkdirSync(directoryPath, { recursive: true });
    writeFileSync(filePath, contents, { encoding: "utf-8", mode: 0o600 });
    // mode is ignored when the file already exists, so force it after the write.
    chmodSync(filePath, 0o600);
  }
}
