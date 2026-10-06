import { describe, expect, it } from "vitest";
import { ProfileGrounding } from "./ProfileGrounding";

const grounding: ProfileGrounding = new ProfileGrounding();
// Fake profile text.
const PROFILE: string = "Backend engineer. Built services for 5 years and led a team of four. Shipped within 12 weeks.";

function missing(text: string, profile: string = PROFILE): string[] {
  return grounding.findUngroundedNumberWords(text, profile);
}

describe("ProfileGrounding number words", () => {
  it("flags a number word followed by no unit: eight in Java", () => {
    expect(missing("I have eight in Java and Spring Boot.")).toEqual(["8"]);
  });

  it("flags a duration: under three months", () => {
    expect(missing("I delivered it in under three months.")).toEqual(["3"]);
  });

  it("accepts a number word that the profile states as a word", () => {
    expect(missing("I led a team of four engineers.")).toEqual([]);
  });

  it("accepts a number word that the profile states as digits", () => {
    expect(missing("I built services for five years.")).toEqual([]);
    expect(missing("Shipped within twelve weeks.")).toEqual([]);
  });

  it("flags a computed duration the profile does not state", () => {
    expect(missing("Eight years of backend work.")).toEqual(["8"]);
  });

  it("lets the idiom one of pass", () => {
    expect(missing("One of the requirements is Java.")).toEqual([]);
    expect(missing("No one on the team had left.")).toEqual([]);
  });

  it("treats one as a claim only before a unit", () => {
    expect(missing("I worked there for one year.")).toEqual(["1"]);
    expect(missing("I led one team.")).toEqual(["1"]);
    expect(missing("I worked there for one year.", "Worked for 1 year.")).toEqual([]);
  });

  it("reads compound and large number words", () => {
    expect(missing("Served twenty-five users.")).toEqual(["25"]);
    expect(missing("Served two hundred users and three thousand orders.")).toEqual(["200", "3000"]);
  });

  it("ignores half, double and fold forms", () => {
    expect(missing("Cut latency by half and doubled throughput, a tenfold gain.")).toEqual([]);
  });
});
