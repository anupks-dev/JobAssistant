export interface Migration {
  getVersion(): number;
  getStatements(): string[];
}
