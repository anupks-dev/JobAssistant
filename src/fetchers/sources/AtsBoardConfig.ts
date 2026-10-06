export type AtsName = "greenhouse" | "lever" | "ashby";

export interface AtsBoardConfig {
  company: string;
  ats: AtsName;
  slug: string;
}
