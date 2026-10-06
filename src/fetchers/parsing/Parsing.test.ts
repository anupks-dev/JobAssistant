import { describe, expect, it } from "vitest";
import { HtmlToText } from "./HtmlToText";
import { ParsedSalary, SalaryParser } from "./SalaryParser";
import { UrlValidator } from "./UrlValidator";
import { SourceCatalog } from "../SourceCatalog";

describe("SalaryParser", () => {
  const parser: SalaryParser = new SalaryParser();

  it("reads common annual ranges", () => {
    const dollars: ParsedSalary = parser.parse("$120,000 - $160,000");
    expect(dollars.known).toBe(true);
    expect(dollars.min).toBe(120000);
    expect(dollars.max).toBe(160000);
    expect(dollars.currency).toBe("USD");

    const commaDecimal: ParsedSalary = parser.parse("$31,2k- $52k");
    expect(commaDecimal.known).toBe(true);
    expect(commaDecimal.min).toBe(31200);
    expect(commaDecimal.max).toBe(52000);

    const euros: ParsedSalary = parser.parse("€60k-80k");
    expect(euros.known).toBe(true);
    expect(euros.min).toBe(60000);
    expect(euros.max).toBe(80000);
    expect(euros.currency).toBe("EUR");

    const pounds: ParsedSalary = parser.parse("£50,000");
    expect(pounds.known).toBe(true);
    expect(pounds.min).toBe(50000);
    expect(pounds.max).toBe(50000);
    expect(pounds.currency).toBe("GBP");
  });

  it("marks unparseable and mixed text as unknown", () => {
    const missing: ParsedSalary = parser.parse("competitive");
    expect(missing.known).toBe(false);
    const mixed: ParsedSalary = parser.parse("$50k or €60k");
    expect(mixed.known).toBe(false);
  });
});

describe("UrlValidator", () => {
  const validator: UrlValidator = new UrlValidator(new SourceCatalog());

  it("rejects http, the wrong host, and malformed URLs", () => {
    expect(validator.isAllowed("http://remoteok.com/api", "remoteok")).toBe(false);
    expect(validator.isAllowed("https://evil.example/jobs", "remoteok")).toBe(false);
    expect(validator.isAllowed("not a url", "remoteok")).toBe(false);
    expect(validator.isAllowed("https://remoteok.com/remote-jobs/1", "remoteok")).toBe(true);
    expect(validator.isAllowed("https://www.remotive.com/remote-jobs/1", "remotive")).toBe(true);
  });

  it("accepts any https ATS url and rejects credentials and IP hosts", () => {
    expect(validator.isAllowed("https://jobs.example.com/gitlab/jobs/1", "greenhouse")).toBe(true);
    expect(validator.isAllowed("https://user:pass@jobs.example.com/gitlab/jobs/1", "greenhouse")).toBe(false);
    expect(validator.isAllowed("https://192.168.1.10/jobs/1", "lever")).toBe(false);
    expect(validator.isAllowed("https://[::1]/jobs/1", "ashby")).toBe(false);
    expect(validator.isAllowed("http://jobs.example.com/jobs/1", "ashby")).toBe(false);
    expect(validator.rejection("https://user:pass@jobs.example.com/jobs/1", "greenhouse")).toBe("invalid_url");
    expect(validator.rejection("https://10.0.0.8/jobs/1", "lever")).toBe("invalid_url");
  });
});

describe("HtmlToText", () => {
  const converter: HtmlToText = new HtmlToText();

  it("strips scripts, styles, and tags", () => {
    const plain: string = converter.toPlainText("<p>Hello</p><script>alert(1)</script><style>.x{}</style>");
    expect(plain).toBe("Hello");
    expect(plain).not.toContain("alert");
  });
});
