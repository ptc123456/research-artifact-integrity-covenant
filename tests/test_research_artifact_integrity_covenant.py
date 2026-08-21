import json
from pathlib import Path

import pytest


CONTRACT = "contracts/research_artifact_integrity_covenant.py"
DOI = "10.5281/zenodo.12786010"
ARTIFACT_ARGS = (
    "DATA",
    "ZENODO_RECORD",
    "12786010",
    "Dataset deposited for the canonical work",
    "record 12786010",
    "sha256:0123456789abcdef",
    True,
    False,
    "",
)


def _deploy(direct_vm, direct_deploy):
    direct_vm.warp("2026-08-11T00:00:00+00:00")
    return direct_deploy(CONTRACT)


def _active_profile(direct_vm, direct_deploy):
    contract = _deploy(direct_vm, direct_deploy)
    profile_id = contract.create_profile(DOI, "")
    contract.add_artifact(profile_id, *ARTIFACT_ARGS)
    contract.activate_profile(profile_id)
    return contract, profile_id


def _active_github_license_profile(direct_vm, direct_deploy):
    contract = _deploy(direct_vm, direct_deploy)
    profile_id = contract.create_profile(DOI, "")
    contract.add_artifact(
        profile_id, "CODE", "GITHUB_COMMIT",
        "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567",
        "SDK implementation for the canonical work", "exact commit", "",
        True, False, "LICENSE",
    )
    contract.activate_profile(profile_id)
    return contract, profile_id


def _mock_ready(direct_vm):
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": '{"message":{"DOI":"10.5281/zenodo.12786010"}}'})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": 200, "body": '{"id":12786010,"metadata":{"license":{"id":"cc-by-4.0"}}}'})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps(
            {
                "decisions": [
                    {
                        "source_id": "12786010",
                        "identity": "MATCH",
                        "access": "AVAILABLE",
                        "version": "ALIGNED",
                        "license": "DECLARED",
                    }
                ]
            }
        ),
    )


def test_only_deployment_wallet_can_upgrade(direct_vm, direct_deploy, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    source = Path(CONTRACT).read_bytes()
    assert contract.get_upgrader() != ""
    contract.upgrade(source)
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the registered upgrader"):
            contract.upgrade(source)


def test_draft_authority_and_immutability(direct_vm, direct_deploy, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    profile_id = contract.create_profile(DOI, "")
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the profile authority"):
            contract.add_artifact(profile_id, *ARTIFACT_ARGS)
    assert int(contract.add_artifact(profile_id, *ARTIFACT_ARGS)) == 0
    contract.activate_profile(profile_id)
    with direct_vm.expect_revert("Only a draft"):
        contract.add_artifact(profile_id, *ARTIFACT_ARGS)


def test_duplicate_artifact_and_empty_activation_do_not_write(direct_vm, direct_deploy):
    contract = _deploy(direct_vm, direct_deploy)
    empty_id = contract.create_profile("10.1000/empty", "")
    with direct_vm.expect_revert("at least one artifact"):
        contract.activate_profile(empty_id)
    assert contract.get_profile(empty_id)["state"] == "DRAFT"

    profile_id = contract.create_profile(DOI, "")
    contract.add_artifact(profile_id, *ARTIFACT_ARGS)
    with direct_vm.expect_revert("already registered"):
        contract.add_artifact(profile_id, *ARTIFACT_ARGS)
    assert contract.get_profile(profile_id)["artifact_count"] == "1"


def test_premature_assessment_is_no_write(direct_vm, direct_deploy):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    with direct_vm.expect_revert("interval has not elapsed"):
        contract.assess_profile(profile_id)
    profile = contract.get_profile(profile_id)
    assert profile["assessment_count"] == "0"
    assert profile["current_status"] == ""


def test_ready_assessment_records_exact_decision(direct_vm, direct_deploy):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    _mock_ready(direct_vm)
    contract.assess_profile(profile_id)

    assert contract.get_current_status(profile_id) == "READY"
    assert contract.is_artifact_set_ready(profile_id) is True
    decision = contract.get_artifact_decision(profile_id, 1, 0)
    assert decision == {
        "access": "AVAILABLE",
        "identity": "MATCH",
        "license": "DECLARED",
        "license_required": "true",
        "source_id": "12786010",
        "version": "ALIGNED",
    }


@pytest.mark.parametrize(
    ("field", "value", "expected_status"),
    [
        ("identity", "MISMATCH", "BLOCKED"),
        ("access", "MISSING", "BLOCKED"),
        ("version", "SUPERSEDED", "DEGRADED"),
        ("license", "ABSENT", "BLOCKED"),
    ],
)
def test_each_consequential_decision_field_controls_readback(direct_vm, direct_deploy, field, value, expected_status):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": 200, "body": "{}"})
    decision = {
        "source_id": "12786010",
        "identity": "MATCH",
        "access": "AVAILABLE",
        "version": "ALIGNED",
        "license": "DECLARED",
    } | {field: value}
    direct_vm.mock_llm(r"evidence classifier", json.dumps({"decisions": [decision]}))
    contract.assess_profile(profile_id)

    assert contract.get_current_status(profile_id) == expected_status
    assert contract.get_artifact_decision(profile_id, 1, 0)[field] == value


@pytest.mark.parametrize(
    ("access", "license_value", "message"),
    [
        ("RESTRICTED_DISCLOSED", "DECLARED", "restricted access against the declaration"),
        ("AVAILABLE", "NOT_APPLICABLE", "required license as not applicable"),
    ],
)
def test_cross_field_decision_conflicts_roll_back(direct_vm, direct_deploy, access, license_value, message):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": 200, "body": "{}"})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "12786010", "identity": "MATCH", "access": access,
            "version": "ALIGNED", "license": license_value,
        }]}),
    )
    with direct_vm.expect_revert(message):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"


def test_declared_license_path_cannot_be_marked_not_applicable(direct_vm, direct_deploy):
    contract = _deploy(direct_vm, direct_deploy)
    profile_id = contract.create_profile(DOI, "")
    contract.add_artifact(
        profile_id, "CODE", "GITHUB_COMMIT",
        "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567",
        "SDK implementation for the canonical work", "exact commit", "",
        False, False, "LICENSE",
    )
    contract.activate_profile(profile_id)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"api\.github\.com/repos/genlayerlabs/genlayer-js/commits/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"raw\.githubusercontent\.com/genlayerlabs/genlayer-js/", {"status": 200, "body": "MIT"})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567",
            "identity": "MATCH", "access": "AVAILABLE", "version": "ALIGNED", "license": "NOT_APPLICABLE",
        }]}),
    )
    with direct_vm.expect_revert("ignores a declared license path"):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"


def test_unavailable_required_license_is_unresolved_then_recovers(direct_vm, direct_deploy):
    contract, profile_id = _active_github_license_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"api\.github\.com/repos/genlayerlabs/genlayer-js/commits/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"raw\.githubusercontent\.com/genlayerlabs/genlayer-js/", {"status": 0, "body": ""})
    unresolved = {
        "source_id": "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567",
        "identity": "MATCH", "access": "AVAILABLE", "version": "ALIGNED", "license": "UNRESOLVED",
    }
    direct_vm.mock_llm(r"evidence classifier", json.dumps({"decisions": [unresolved]}))
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "UNRESOLVED"

    direct_vm.warp("2026-08-11T00:02:02+00:00")
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"api\.github\.com/repos/genlayerlabs/genlayer-js/commits/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"raw\.githubusercontent\.com/genlayerlabs/genlayer-js/", {"status": 200, "body": "MIT"})
    direct_vm.mock_llm(r"evidence classifier", json.dumps({"decisions": [unresolved | {"license": "DECLARED"}]}))
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "READY"


def test_unavailable_required_license_cannot_commit_absent(direct_vm, direct_deploy):
    contract, profile_id = _active_github_license_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"api\.github\.com/repos/genlayerlabs/genlayer-js/commits/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"raw\.githubusercontent\.com/genlayerlabs/genlayer-js/", {"status": 0, "body": ""})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567",
            "identity": "MATCH", "access": "AVAILABLE", "version": "ALIGNED", "license": "ABSENT",
        }]}),
    )
    with direct_vm.expect_revert("required-license evidence must remain unresolved"):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"


def test_complete_transport_failure_records_only_unresolved(direct_vm, direct_deploy):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 0, "body": ""})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": 0, "body": ""})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "12786010", "identity": "UNRESOLVED", "access": "UNRESOLVED",
            "version": "UNRESOLVED", "license": "UNRESOLVED",
        }]}),
    )
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "UNRESOLVED"
    assert contract.get_artifact_decision(profile_id, 1, 0)["license"] == "UNRESOLVED"


@pytest.mark.parametrize("transient_status", [429, 503])
def test_transient_primary_http_is_fail_closed_then_recovers(direct_vm, direct_deploy, transient_status):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": transient_status, "body": ""})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "12786010", "identity": "MISMATCH", "access": "MISSING",
            "version": "CONFLICT", "license": "ABSENT",
        }]}),
    )
    with direct_vm.expect_revert("Unavailable artifact evidence must remain unresolved"):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": transient_status, "body": ""})
    direct_vm.mock_llm(
        r"evidence classifier",
        json.dumps({"decisions": [{
            "source_id": "12786010", "identity": "UNRESOLVED", "access": "UNRESOLVED",
            "version": "UNRESOLVED", "license": "UNRESOLVED",
        }]}),
    )
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "UNRESOLVED"

    direct_vm.warp("2026-08-11T00:02:02+00:00")
    direct_vm.clear_mocks()
    _mock_ready(direct_vm)
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "READY"


@pytest.mark.parametrize("transient_status", [429, 503])
def test_transient_license_http_is_fail_closed_then_recovers(direct_vm, direct_deploy, transient_status):
    contract, profile_id = _active_github_license_profile(direct_vm, direct_deploy)
    source_id = "genlayerlabs/genlayer-js/0123456789abcdef0123456789abcdef01234567"
    direct_vm.warp("2026-08-11T00:01:01+00:00")

    def mock_evidence(license_status, license_value):
        direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
        direct_vm.mock_web(r"api\.github\.com/repos/genlayerlabs/genlayer-js/commits/", {"status": 200, "body": "{}"})
        direct_vm.mock_web(r"raw\.githubusercontent\.com/genlayerlabs/genlayer-js/", {"status": license_status, "body": "MIT" if license_status == 200 else ""})
        direct_vm.mock_llm(
            r"evidence classifier",
            json.dumps({"decisions": [{
                "source_id": source_id, "identity": "MATCH", "access": "AVAILABLE",
                "version": "ALIGNED", "license": license_value,
            }]}),
        )

    mock_evidence(transient_status, "ABSENT")
    with direct_vm.expect_revert("required-license evidence must remain unresolved"):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"

    direct_vm.clear_mocks()
    mock_evidence(transient_status, "UNRESOLVED")
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "UNRESOLVED"

    direct_vm.warp("2026-08-11T00:02:02+00:00")
    direct_vm.clear_mocks()
    mock_evidence(200, "DECLARED")
    contract.assess_profile(profile_id)
    assert contract.get_current_status(profile_id) == "READY"


def test_malformed_ai_output_rolls_back(direct_vm, direct_deploy):
    contract, profile_id = _active_profile(direct_vm, direct_deploy)
    direct_vm.warp("2026-08-11T00:01:01+00:00")
    direct_vm.mock_web(r"api\.crossref\.org/works/", {"status": 200, "body": "{}"})
    direct_vm.mock_web(r"zenodo\.org/api/records/12786010", {"status": 200, "body": "{}"})
    direct_vm.mock_llm(r"evidence classifier", '{"decisions":[],"extra":true}')
    with direct_vm.expect_revert("only decisions"):
        contract.assess_profile(profile_id)
    assert contract.get_profile(profile_id)["assessment_count"] == "0"


def test_successor_supersedes_only_current_version(direct_vm, direct_deploy):
    contract, first_id = _active_profile(direct_vm, direct_deploy)
    successor_id = contract.create_profile(DOI, first_id)
    contract.add_artifact(successor_id, *ARTIFACT_ARGS)
    contract.activate_profile(successor_id)
    assert contract.get_profile(first_id)["state"] == "SUPERSEDED"
    assert contract.get_profile(successor_id)["state"] == "ACTIVE"
    with direct_vm.expect_revert("active version exists"):
        contract.create_profile(DOI, "")


def test_initial_draft_authority_can_activate_and_non_authority_is_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        profile_id = contract.create_profile(DOI, "")
        contract.add_artifact(profile_id, *ARTIFACT_ARGS)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the profile authority can activate this draft"):
            contract.activate_profile(profile_id)

    assert contract.get_profile(profile_id)["state"] == "DRAFT"

    with direct_vm.prank(direct_alice):
        contract.activate_profile(profile_id)

    assert contract.get_profile(profile_id)["state"] == "ACTIVE"


def test_attacker_cannot_activate_successor_proposal(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

    with direct_vm.prank(direct_bob):
        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)
        with direct_vm.expect_revert("Only the active predecessor authority can activate a successor profile"):
            contract.activate_profile(p2)

    assert contract.get_profile(p1)["state"] == "ACTIVE"
    assert contract.get_profile(p2)["state"] == "DRAFT"


def test_predecessor_authority_can_activate_proposer_successor(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

    assert contract.get_active_profile(DOI) == p1

    with direct_vm.prank(direct_bob):
        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)

    with direct_vm.prank(direct_alice):
        contract.activate_profile(p2)

    assert contract.get_profile(p1)["state"] == "SUPERSEDED"
    assert contract.get_profile(p2)["state"] == "ACTIVE"
    assert contract.get_active_profile(DOI) == p2


def test_stale_successor_cannot_activate_after_predecessor_superseded(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

    with direct_vm.prank(direct_bob):
        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)

    with direct_vm.prank(direct_charlie):
        p3 = contract.create_profile(DOI, p1)
        contract.add_artifact(p3, *ARTIFACT_ARGS)

    with direct_vm.prank(direct_alice):
        contract.activate_profile(p3)

    assert contract.get_profile(p3)["state"] == "ACTIVE"
    assert contract.get_profile(p1)["state"] == "SUPERSEDED"

    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("Predecessor profile must be the active version"):
            contract.activate_profile(p2)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Predecessor profile must be the active version"):
            contract.activate_profile(p2)

    assert contract.get_profile(p2)["state"] == "DRAFT"


def test_unrelated_wallet_cannot_activate_successor(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

    with direct_vm.prank(direct_bob):
        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)

    with direct_vm.prank(direct_charlie):
        with direct_vm.expect_revert("Only the active predecessor authority can activate a successor profile"):
            contract.activate_profile(p2)

    assert contract.get_profile(p1)["state"] == "ACTIVE"
    assert contract.get_profile(p2)["state"] == "DRAFT"


def test_same_authority_successor_activates_cleanly(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)
        contract.activate_profile(p2)

    assert contract.get_profile(p1)["state"] == "SUPERSEDED"
    assert contract.get_profile(p2)["state"] == "ACTIVE"


def test_failed_authorization_leaves_state_and_pointers_unchanged(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy)
    with direct_vm.prank(direct_alice):
        p1 = contract.create_profile(DOI, "")
        contract.add_artifact(p1, *ARTIFACT_ARGS)
        contract.activate_profile(p1)

    with direct_vm.prank(direct_bob):
        p2 = contract.create_profile(DOI, p1)
        contract.add_artifact(p2, *ARTIFACT_ARGS)

    p1_before = contract.get_profile(p1)
    p2_before = contract.get_profile(p2)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the active predecessor authority"):
            contract.activate_profile(p2)

    with direct_vm.prank(direct_charlie):
        with direct_vm.expect_revert("Only the active predecessor authority"):
            contract.activate_profile(p2)

    assert contract.get_profile(p1) == p1_before
    assert contract.get_profile(p2) == p2_before

    with direct_vm.expect_revert("active version exists"):
        contract.create_profile(DOI, "")

    with direct_vm.expect_revert("must be the active version"):
        contract.create_profile(DOI, p2)

    p3 = contract.create_profile(DOI, p1)
    assert p3 != ""
