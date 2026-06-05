from __future__ import annotations

import asyncio

import pytest

from nvoke import (
    AmbiguousConnectorError,
    canonicalize,
    covers,
    create_registry,
    echo_connector,
    in_process_connector,
    validate_descriptor,
)


def test_scope_coverage_matches_grantz_shape() -> None:
    assert covers(
        {"action": "write", "resource": "artifact.*", "qualifier": None},
        {"action": "write", "resource": "artifact.report", "qualifier": None},
    )
    assert not covers(
        {"action": "read", "resource": "artifact.*", "qualifier": None},
        {"action": "write", "resource": "artifact.report", "qualifier": None},
    )


def test_validate_descriptor_requires_reversibility() -> None:
    connector = echo_connector()
    validate_descriptor(connector)


def test_registry_resolves_and_executes_single_match() -> None:
    async def run() -> None:
        registry = create_registry([echo_connector()])
        connector = registry.resolve({"action": "echo", "resource": "tool.echo", "qualifier": None})
        assert connector is not None
        result, actual = await connector.execute(
            {"message": "hi"},
            {"scope": {"action": "echo", "resource": "tool.echo", "qualifier": None}},
        )
        assert result == {"message": "hi"}
        assert actual == {"tool_calls": 1, "model_cost_usd": 0}

    asyncio.run(run())


def test_registry_rejects_ambiguous_resolution() -> None:
    registry = create_registry([echo_connector("echo_a"), echo_connector("echo_b")])
    with pytest.raises(AmbiguousConnectorError):
        registry.resolve({"action": "echo", "resource": "tool.echo", "qualifier": None})


def test_registry_lists_descriptors_and_canonicalizes() -> None:
    registry = create_registry(
        [
            in_process_connector(
                id="read_profile",
                required_scope={"action": "read", "resource": "profile.self", "qualifier": None},
                reversibility="read",
                execute=lambda _payload, _context: ("ok", {}),
            )
        ]
    )
    descriptors = registry.list()

    assert descriptors[0].id == "read_profile"
    assert descriptors[0].reversibility == "read"
    assert canonicalize({"b": 2, "a": 1}) == '{"a":1,"b":2}'
