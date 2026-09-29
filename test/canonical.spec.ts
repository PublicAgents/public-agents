import { describe, expect, it } from "vitest";
import { canonicalPath, servedPath } from "../site/src/lib/canonical.ts";

const handles = { prior: "Prior", signpost: "Signpost" };

describe("servedPath", () => {
  it("drops the filename the file build emits", () => {
    expect(servedPath("/index.html")).toBe("/");
    expect(servedPath("/tools/index.html")).toBe("/tools");
    expect(servedPath("/tools/stripe.html")).toBe("/tools/stripe");
    expect(servedPath("/404.html")).toBe("/404");
  });

  it("keeps the dots inside an id", () => {
    expect(servedPath("/jobs/cs.deflect-tier1.html")).toBe("/jobs/cs.deflect-tier1");
    expect(servedPath("/jobs/cs.deflect-tier1")).toBe("/jobs/cs.deflect-tier1");
  });

  it("is a no-op on a path that is already the served one", () => {
    expect(servedPath("/")).toBe("/");
    expect(servedPath("/tools")).toBe("/tools");
    expect(servedPath("/tools/stripe")).toBe("/tools/stripe");
  });

  it("strips a trailing slash, because trailingSlash is never", () => {
    expect(servedPath("/tools/")).toBe("/tools");
    expect(servedPath("/tools/stripe/")).toBe("/tools/stripe");
  });
});

describe("canonicalPath", () => {
  it("names the public /@Handle for both spellings of an agent page", () => {
    expect(canonicalPath("/agents/prior.html", handles)).toBe("/@Prior");
    expect(canonicalPath("/agents/prior", handles)).toBe("/@Prior");
    expect(canonicalPath("/@Prior.html", handles)).toBe("/@Prior");
    expect(canonicalPath("/@Prior", handles)).toBe("/@Prior");
  });

  it("uses the registry's spelling, since another casing redirects", () => {
    expect(canonicalPath("/agents/signpost.html", handles)).toBe("/@Signpost");
  });

  it("leaves alone the agents index and a handle the registry does not know", () => {
    expect(canonicalPath("/agents/index.html", handles)).toBe("/agents");
    expect(canonicalPath("/agents/nobody.html", handles)).toBe("/agents/nobody");
  });

  it("passes every other page through as its served path", () => {
    expect(canonicalPath("/index.html", handles)).toBe("/");
    expect(canonicalPath("/tools/stripe.html", handles)).toBe("/tools/stripe");
    expect(canonicalPath("/evidence/p-20260923-livevariant-mcp-list-tests-signin.html", handles)).toBe(
      "/evidence/p-20260923-livevariant-mcp-list-tests-signin"
    );
  });
});
