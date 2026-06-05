import type {
  Connector,
  ConnectorDescriptor,
  ConnectorRegistry,
  ExecuteContext,
  Reversibility,
  Scope,
  Spend,
  SpendRequest,
} from "@nvoke/core";
import { covers, validateDescriptor } from "@nvoke/core";

export class AmbiguousConnectorError extends Error {
  constructor(scope: Scope, matches: readonly Connector[]) {
    super(
      `Ambiguous connector resolution for ${scope.action}:${scope.resource}: ${matches.map((match) => match.id).join(", ")}`,
    );
  }
}

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    validateDescriptor(connector);
    this.connectors.set(connector.id, connector);
  }

  resolve(scope: Scope): Connector | undefined {
    const matches = [...this.connectors.values()].filter((connector) =>
      covers(connector.requiredScope, scope),
    );
    if (matches.length > 1) {
      throw new AmbiguousConnectorError(scope, matches);
    }
    return matches[0];
  }

  list(): readonly ConnectorDescriptor[] {
    return [...this.connectors.values()].map(({ execute: _execute, ...descriptor }) => descriptor);
  }
}

export function createRegistry(connectors: readonly Connector[] = []): InMemoryConnectorRegistry {
  const registry = new InMemoryConnectorRegistry();
  for (const connector of connectors) {
    registry.register(connector);
  }
  return registry;
}

export function inProcessConnector(options: {
  readonly id: string;
  readonly requiredScope: Scope;
  readonly reversibility?: Reversibility;
  readonly estimate?: (payload: unknown) => SpendRequest;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly execute: (
    payload: unknown,
    context: ExecuteContext,
  ) => Promise<{ result: unknown; actual: Spend }> | { result: unknown; actual: Spend };
}): Connector {
  return {
    id: options.id,
    kind: "in_process",
    requiredScope: options.requiredScope,
    reversibility: options.reversibility ?? "write",
    estimate: options.estimate ?? (() => ({ estimate: { tool_calls: 1 } })),
    metadata: options.metadata,
    async execute(payload, context) {
      return options.execute(payload, context);
    },
  };
}

export function echoConnector(
  id = "echo",
  requiredScope: Scope = { action: "echo", resource: "tool.echo" },
): Connector {
  return inProcessConnector({
    id,
    requiredScope,
    reversibility: "read",
    estimate: () => ({ estimate: { tool_calls: 1, model_cost_usd: 0 } }),
    execute: async (payload) => ({
      result: payload,
      actual: { tool_calls: 1, model_cost_usd: 0 },
    }),
  });
}
