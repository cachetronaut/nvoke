import { describe, expect, it } from "vitest";
import {
  AmbiguousConnectorError,
  createRegistry,
  echoConnector,
  inProcessConnector,
} from "../src/index";

describe("InMemoryConnectorRegistry", () => {
  it("resolves the single connector whose required scope covers the request", async () => {
    const registry = createRegistry([echoConnector()]);
    const connector = registry.resolve({ action: "echo", resource: "tool.echo" });

    expect(connector?.id).toBe("echo");
    await expect(
      connector?.execute({ message: "hi" }, { scope: { action: "echo", resource: "tool.echo" } }),
    ).resolves.toEqual({
      result: { message: "hi" },
      actual: { tool_calls: 1, model_cost_usd: 0 },
    });
  });

  it("throws instead of silently picking an ambiguous connector", () => {
    const registry = createRegistry([echoConnector("echo_a"), echoConnector("echo_b")]);

    expect(() => registry.resolve({ action: "echo", resource: "tool.echo" })).toThrow(
      AmbiguousConnectorError,
    );
  });

  it("lists descriptors without execute functions", () => {
    const registry = createRegistry([
      inProcessConnector({
        id: "read_profile",
        requiredScope: { action: "read", resource: "profile.self" },
        reversibility: "read",
        execute: () => ({ result: "ok", actual: {} }),
      }),
    ]);

    expect(registry.list()).toEqual([
      expect.objectContaining({
        id: "read_profile",
        kind: "in_process",
        reversibility: "read",
      }),
    ]);
    const descriptors = registry.list();
    const descriptor = descriptors[0];
    if (descriptor === undefined) {
      throw new Error("Expected one descriptor");
    }
    expect("execute" in descriptor).toBe(false);
  });
});
