import { canonicalize } from "./canonical.js";
import type { ConnectorDescriptor, Reversibility, Scope } from "./types.js";

export function covers(granted: Scope, requested: Scope): boolean {
  if (granted.action !== "*" && granted.action !== requested.action) {
    return false;
  }
  if (granted.resource !== "*" && granted.resource !== requested.resource) {
    if (
      !(
        granted.resource.endsWith(".*") &&
        requested.resource.startsWith(granted.resource.slice(0, -1))
      )
    ) {
      return false;
    }
  }
  if (granted.qualifier === undefined) {
    return true;
  }
  return canonicalize(granted.qualifier) === canonicalize(requested.qualifier);
}

export function isValidReversibility(value: string): value is Reversibility {
  return value === "read" || value === "write" || value === "external_effect";
}

export function validateDescriptor(descriptor: ConnectorDescriptor): void {
  if (descriptor.id.length === 0) {
    throw new Error("Connector id is required");
  }
  if (descriptor.kind.length === 0) {
    throw new Error("Connector kind is required");
  }
  if (!isValidReversibility(descriptor.reversibility)) {
    throw new Error(`Invalid connector reversibility: ${descriptor.reversibility}`);
  }
  if (
    descriptor.requiredScope.action.length === 0 ||
    descriptor.requiredScope.resource.length === 0
  ) {
    throw new Error("Connector requiredScope action and resource are required");
  }
}
