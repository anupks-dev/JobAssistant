export interface HttpResponseResult {
  status: number;
  bodyText: string;
  headers: Record<string, string>;
}

export interface HttpClient {
  get(url: string, sourceId: string, requestDelayMs: number): Promise<HttpResponseResult>;
}
