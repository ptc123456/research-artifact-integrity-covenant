# Research Artifact Integrity Covenant

Research Artifact Integrity Covenant registers versioned research-artifact packages and uses GenLayer consensus to assess whether their public evidence still matches four narrow declarations: identity, access, version alignment, and license disclosure.

The contract does **not** judge scientific correctness, reproducibility, legal validity, intellectual-property ownership, or research quality.

## Current status

The contract and frontend are implemented and locally verified. No Studionet deployment has been performed yet, so this revision intentionally contains no contract address or deployment claim.

## Why GenLayer

A DOI, repository commit, or archive record can remain syntactically valid while the evidence it resolves to becomes unavailable, superseded, contradictory, or differently licensed. A single application server should not unilaterally make that consequential classification. GenLayer validators independently fetch the public evidence and reach strict agreement on the exact fields written to contract state.

A conventional backend is sufficient when a trusted operator owns the source of truth or when the result has no shared downstream consequence.

## Contract lifecycle

1. An authority creates a `DRAFT` profile for a canonical work DOI.
2. The authority registers one to three exact DataCite DOI, Zenodo record, or GitHub commit artifacts.
3. Activation freezes the package as `ACTIVE`; a later version must name and supersede the current active profile.
4. After the assessment interval, any caller may request a fresh public-evidence assessment.
5. Strict validator agreement stores one decision per artifact and deterministically derives `READY`, `DEGRADED`, `UNRESOLVED`, or `BLOCKED`.

## Public API

Writes:

- `create_profile(canonical_work_doi, previous_profile_id)`
- `add_artifact(profile_id, artifact_type, source_kind, canonical_source_id, expected_relationship, expected_version, declared_digest, license_required, restricted_access_allowed, license_path)` → returns the transaction-specific artifact index
- `activate_profile(profile_id)`
- `assess_profile(profile_id)`
- `upgrade(new_code)` — restricted by GenVM to the registered deployment-wallet upgrader

Views:

- `get_profile_count()`
- `get_profile(profile_id)`
- `get_artifact(profile_id, artifact_index)`
- `get_current_status(profile_id)`
- `get_assessment(profile_id, epoch)`
- `get_artifact_decision(profile_id, epoch, artifact_index)`
- `is_artifact_set_ready(profile_id)` — compact oracle surface for downstream gates
- `has_regressed(profile_id)`
- `get_min_assessment_delay_seconds()`
- `get_upgrader()`

Downstream systems can use `is_artifact_set_ready` to gate a research registry import, use `get_current_status` to annotate a citation or model registry, or monitor `has_regressed` before continuing a workflow that depends on the artifact package.

## Decision vocabulary

| Dimension | Values |
|---|---|
| Identity | `MATCH`, `MISMATCH`, `UNRESOLVED` |
| Access | `AVAILABLE`, `RESTRICTED_DISCLOSED`, `MISSING`, `UNRESOLVED` |
| Version | `ALIGNED`, `SUPERSEDED`, `CONFLICT`, `UNRESOLVED` |
| License | `DECLARED`, `ABSENT`, `CONFLICT`, `NOT_APPLICABLE`, `UNRESOLVED` |

## Consensus binding

| Field | Source | Stored | Downstream effect | Validator check | Binding mode | Regression coverage |
|---|---|---:|---|---|---|---|
| `source_id` | Canonical declaration | Yes | Decision-to-artifact identity | Exact ID and input order | Strict exact | Reordered/replaced output rejected |
| `identity` | Public evidence | Yes | Can block package | Enum plus evidence assessment | Strict exact | Malformed/conflicting output rolls back |
| `access` | Public evidence | Yes | Can degrade or block | Enum plus evidence assessment | Strict exact | Missing/unresolved paths covered |
| `version` | Public evidence | Yes | Can degrade or block | Enum plus evidence assessment | Strict exact | Conflicting output cannot commit |
| `license` | Public evidence | Yes | Can block when required | Enum plus declaration rules | Strict exact | Absent/conflicting output covered |
| `overall_status` | Decision set | Yes | Oracle result | Derived by contract | Deterministic | READY and rollback paths covered |
| `has_regressed` | Previous/current status | Yes | Downstream warning | Derived by severity order | Deterministic | Successor/assessment state covered |

## Failure behavior and security boundary

- User-provided text and fetched web content are explicitly treated as untrusted evidence, never as prompt instructions.
- Canonical identifiers, lengths, artifact count, ownership, lifecycle, duplicate sources, and license paths are validated before consensus.
- Web bodies and license content are bounded. Transport status `0`, HTTP `429`, and HTTP `500–599` are constrained to `UNRESOLVED`; unavailable required-license evidence cannot become `ABSENT` or `BLOCKED`. Exact-object `404/410` retains the documented missing/absent meaning, while malformed or non-consensual output writes nothing.
- The model must return one exact ordered schema. Unknown fields, missing decisions, unsupported enums, reordering, and malformed output fail closed without a state write.
- An assessment cannot be replayed inside the 60-second minimum interval.
- The deployment wallet is registered as the native GenVM upgrader. Any upgrade must preserve the declared storage-field order and types; an unauthorized caller cannot replace code.
- A failed or disagreeing transaction is not considered successful by the frontend and remains subject to reconciliation and authoritative readback.

## Frontend

The React workbench supports profile inspection, draft creation, artifact registration, activation, and current-evidence assessment. Wallet connection always opens a provider selector; no wallet is selected automatically. Writes require a valid deployed Studionet address, a selected account, transaction finality, successful execution, explicit validator agreement, and matching contract readback. Creation and artifact registration decode their identity from the exact transaction return instead of inferring it from aggregate counters; pending recovery reuses the saved hash and the original expected fields.

Create `frontend/.env.local` only after deployment and set `VITE_GENLAYER_CONTRACT_ADDRESS` to the verified Studionet address. Do not use a guessed or placeholder address.

## Local verification

Python 3.12 is required.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e .
genvm-lint check contracts\research_artifact_integrity_covenant.py
.venv\Scripts\python.exe -m pytest tests -q
cd frontend
npm ci
npm run lint
npm test
npm run build
```

## Limitations

- Evidence sources are limited to DataCite DOI records, Zenodo records, GitHub exact commits, Crossref work metadata, and an optional exact-commit license path.
- Public endpoints may be temporarily unavailable; transport uncertainty is not converted into a positive claim.
- The covenant verifies declared artifact integrity dimensions, not the contents or merit of the research itself.
- A package holds at most three artifacts to bound validator work and consensus cost.

## Recovery

The contract is intentionally upgradable. The selected external deployment wallet becomes its native GenVM upgrader. If Studio loses local UI state while Studionet remains intact, import the recorded contract address and verify the committed source before any upgrade. If Studionet state is reset, redeploy the exact recorded source, re-run live contract journeys, update the frontend address only after successful readback, and publish new evidence. Upgrades must preserve the existing storage declaration order and types unless a separately reviewed migration is provided.

## Repository structure

```text
contracts/   Intelligent Contract
tests/       Direct Mode contract tests
frontend/    React workbench and frontend tests
docs/        Approved specification and architecture
```

## License

MIT
