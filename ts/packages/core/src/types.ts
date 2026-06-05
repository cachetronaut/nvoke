export type Reversibility = "read" | "write" | "external_effect";

export interface Scope {
  readonly action: string;
  readonly resource: string;
  readonly qualifier?: unknown;
}

export type Spend = Readonly<Record<string, number>>;

export interface SpendRequest {
  readonly estimate: Spend;
  readonly runId?: string;
}

export interface ExecuteContext {
  readonly principal?: unknown;
  readonly claims?: unknown;
  readonly scope: Scope;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface ConnectorDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly requiredScope: Scope;
  readonly reversibility: Reversibility;
  estimate(payload: unknown): SpendRequest;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Connector extends ConnectorDescriptor {
  execute(payload: unknown, context: ExecuteContext): Promise<{ result: unknown; actual: Spend }>;
}

export interface ConnectorRegistry {
  register(connector: Connector): void;
  resolve(scope: Scope): Connector | undefined;
  list(): readonly ConnectorDescriptor[];
}
