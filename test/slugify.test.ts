import { describe, it, expect } from "vitest";
import { slugify } from "../src/slugify.js";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Add User Authentication")).toBe("add-user-authentication");
  });

  it("removes non-alphanumeric characters", () => {
    expect(slugify("Fix bug: login [urgent]")).toBe("fix-bug-login-urgent");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("foo---bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to 50 characters at a word boundary", () => {
    const long = "this is a very long issue title that should be truncated at a word boundary somewhere";
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).not.toMatch(/-$/);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("issue");
  });
});
