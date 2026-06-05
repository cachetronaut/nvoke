from __future__ import annotations

import inspect
import json
from builtins import list as builtin_list
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, NotRequired, Protocol, TypedDict, cast

Reversibility = Literal["read", "write", "external_effect"]
Spend = dict[str, float]


class Scope(TypedDict):
    action: str
    resource: str
    qualifier: NotRequired[Any]


@dataclass(frozen=True)
class SpendRequest:
    estimate: Spend
    run_id: str | None = None


class ExecuteContext(TypedDict, total=False):
    principal: Any
    claims: Any
    scope: Scope
    context: dict[str, Any]


@dataclass(frozen=True)
class ConnectorDescriptor:
    id: str
    kind: str
    required_scope: Scope
    reversibility: Reversibility
    estimate: Callable[[object], SpendRequest]
    metadata: dict[str, Any] = field(default_factory=dict)


class Connector(Protocol):
    id: str
    kind: str
    required_scope: Scope
    reversibility: Reversibility
    metadata: dict[str, Any]

    def estimate(self, payload: object) -> SpendRequest: ...

    async def execute(self, payload: object, context: ExecuteContext) -> tuple[object, Spend]: ...


class AmbiguousConnectorError(Exception):
    pass


class InMemoryConnectorRegistry:
    def __init__(self) -> None:
        self._connectors: dict[str, Connector] = {}

    def register(self, connector: Connector) -> None:
        validate_descriptor(connector)
        self._connectors[connector.id] = connector

    def resolve(self, scope: Scope) -> Connector | None:
        matches = [
            connector
            for connector in self._connectors.values()
            if covers(connector.required_scope, scope)
        ]
        if len(matches) > 1:
            ids = ", ".join(connector.id for connector in matches)
            raise AmbiguousConnectorError(f"Ambiguous connector resolution: {ids}")
        return matches[0] if matches else None

    def list(self) -> builtin_list[ConnectorDescriptor]:
        return [
            ConnectorDescriptor(
                id=connector.id,
                kind=connector.kind,
                required_scope=connector.required_scope,
                reversibility=connector.reversibility,
                estimate=connector.estimate,
                metadata=dict(connector.metadata),
            )
            for connector in self._connectors.values()
        ]


@dataclass(frozen=True)
class _FunctionConnector:
    id: str
    required_scope: Scope
    execute_fn: Callable[
        [object, ExecuteContext], Awaitable[tuple[object, Spend]] | tuple[object, Spend]
    ]
    reversibility: Reversibility = "write"
    estimate_fn: Callable[[object], SpendRequest] = lambda _payload: SpendRequest({"tool_calls": 1})
    metadata: dict[str, Any] = field(default_factory=dict)
    kind: str = "in_process"

    def estimate(self, payload: object) -> SpendRequest:
        return self.estimate_fn(payload)

    async def execute(self, payload: object, context: ExecuteContext) -> tuple[object, Spend]:
        result = self.execute_fn(payload, context)
        if inspect.isawaitable(result):
            return cast(tuple[object, Spend], await result)
        return cast(tuple[object, Spend], result)


def create_registry(connectors: list[Connector] | None = None) -> InMemoryConnectorRegistry:
    registry = InMemoryConnectorRegistry()
    for connector in connectors or []:
        registry.register(connector)
    return registry


def in_process_connector(
    *,
    id: str,
    required_scope: Scope,
    execute: Callable[
        [object, ExecuteContext], Awaitable[tuple[object, Spend]] | tuple[object, Spend]
    ],
    reversibility: Reversibility = "write",
    estimate: Callable[[object], SpendRequest] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Connector:
    return _FunctionConnector(
        id=id,
        required_scope=required_scope,
        execute_fn=execute,
        reversibility=reversibility,
        estimate_fn=estimate or (lambda _payload: SpendRequest({"tool_calls": 1})),
        metadata=metadata or {},
    )


def echo_connector(
    id: str = "echo",
    required_scope: Scope | None = None,
) -> Connector:
    return in_process_connector(
        id=id,
        required_scope=required_scope
        or {"action": "echo", "resource": "tool.echo", "qualifier": None},
        reversibility="read",
        estimate=lambda _payload: SpendRequest({"tool_calls": 1, "model_cost_usd": 0}),
        execute=lambda payload, _context: (
            payload,
            {"tool_calls": 1.0, "model_cost_usd": 0.0},
        ),
    )


def covers(granted: Scope, requested: Scope) -> bool:
    if granted["action"] not in {"*", requested["action"]}:
        return False
    resource = granted["resource"]
    requested_resource = requested["resource"]
    if (
        resource != "*"
        and resource != requested_resource
        and not (resource.endswith(".*") and requested_resource.startswith(resource[:-1]))
    ):
        return False
    if granted.get("qualifier") is None:
        return True
    return canonicalize(granted.get("qualifier")) == canonicalize(requested.get("qualifier"))


def validate_descriptor(descriptor: Connector) -> None:
    if not descriptor.id:
        raise ValueError("Connector id is required")
    if not descriptor.kind:
        raise ValueError("Connector kind is required")
    if descriptor.reversibility not in {"read", "write", "external_effect"}:
        raise ValueError(f"Invalid connector reversibility: {descriptor.reversibility}")
    if not descriptor.required_scope["action"] or not descriptor.required_scope["resource"]:
        raise ValueError("Connector required_scope action and resource are required")


def canonicalize(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=_json_default)


def _json_default(value: object) -> object:
    if hasattr(value, "__dict__"):
        return value.__dict__
    raise TypeError(f"Cannot serialize {type(value)!r}")
