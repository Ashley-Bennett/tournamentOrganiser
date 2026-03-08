import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases the input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  it("removes characters that are not alphanumeric or hyphens", () => {
    expect(slugify("hello!@#world")).toBe("helloworld");
    expect(slugify("it's a test")).toBe("its-a-test");
  });

  it("collapses multiple consecutive hyphens into one", () => {
    expect(slugify("foo--bar")).toBe("foo-bar");
    expect(slugify("foo   bar")).toBe("foo-bar"); // multiple spaces → multiple hyphens → collapsed
  });

  it("strips leading and trailing hyphens after transformation", () => {
    expect(slugify("-hello-")).toBe("hello");
    expect(slugify("!hello!")).toBe("hello");
  });

  it("returns an empty string for an empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("passes through already-valid slugs unchanged", () => {
    expect(slugify("already-slugified")).toBe("already-slugified");
    expect(slugify("abc123")).toBe("abc123");
  });

  it("handles tournament names with numbers", () => {
    expect(slugify("Tournament 2024")).toBe("tournament-2024");
    expect(slugify("Round 1")).toBe("round-1");
  });

  it("removes non-ASCII characters (accents etc.)", () => {
    // 'é' is not in [a-z0-9-] so it is stripped
    expect(slugify("café")).toBe("caf");
    expect(slugify("naïve")).toBe("nave");
  });
});
