import { describe, expect, it } from "vitest";
import { canonicalize, covers, validateDescriptor } from "../src/index";

describe("connector core", () => {
  it("uses Grantz-compatible scope coverage", () => {
    expect(
      covers(
        { action: "write", resource: "artifact.*" },
        { action: "write", resource: "artifact.report" },
      ),
    ).toBe(true);
    expect(
      covers(
        { action: "read", resource: "artifact.*" },
        { action: "write", resource: "artifact.report" },
      ),
    ).toBe(false);
  });

  it("requires explicit reversibility", () => {
    expect(() =>
      validateDescriptor({
        id: "echo",
        kind: "in_process",
        requiredScope: { action: "echo", resource: "tool.echo" },
        reversibility: "write",
        estimate: () => ({ estimate: { tool_calls: 1 } }),
      }),
    ).not.toThrow();
  });

  it("canonicalizes descriptors deterministically", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});
