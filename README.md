# Research Artifact Integrity Covenant

Research Artifact Integrity Covenant registers versioned research-artifact packages and uses GenLayer consensus to assess whether their public evidence still matches four narrow declarations: identity, access, version alignment, and license disclosure.

## Verified links

- Studionet contract: [`0xD0bB9C0D436092d7bBB03F2458C60473739923EC`](https://explorer-studio.genlayer.com/address/0xD0bB9C0D436092d7bBB03F2458C60473739923EC)
- Deployment transaction: [`0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82`](https://explorer-studio.genlayer.com/tx/0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82)
- Live application: [research-artifact-integrity-covenan.vercel.app](https://research-artifact-integrity-covenan.vercel.app)
- Verification package: [`docs/VERIFICATION.md`](docs/VERIFICATION.md)
- Live canonical demo profile: `profile-000003` (`READY`, one verified Zenodo artifact); its predecessor `profile-000002` is retained as `SUPERSEDED`

Network: Studionet, chain ID `61999`. The deployed source matches [`contracts/research_artifact_integrity_covenant.py`](contracts/research_artifact_integrity_covenant.py) at SHA-256 `0DE27E5118828C8279A45509237C866D417F8823F3DCBD9AE343F2C855CE1972`.

## Trust problem

A DOI, repository commit, or archive record can remain syntactically valid while the evidence it resolves to becomes unavailable, superseded, contradictory, or differently licensed. Research registries and downstream automation cannot safely rely on one package author or application server to classify those changes unilaterally.

This covenant does **not** judge scientific correctness, reproducibility, legal validity, intellectual-property ownership, or research quality.

## Why GenLayer is essential

Validators independently fetch current public evidence from Crossref and the declared artifact source, classify identity, access, version, and license disclosure, and reach strict agreement on the consequential fields written to contract state. The contract deterministically derives the package status from that agreed decision set.

A conventional backend is sufficient when a trusted operator owns the source of truth or when the result has no shared downstream consequence. Here the classification becomes shared, persistent state that other systems can use as a gate, so independent nondeterministic consensus is the core trust mechanism.

## How it works

1. Any wallet may create a `DRAFT` profile for a canonical work DOI (an initial profile or a successor proposal naming the active profile).
2. The draft creator registers one to three exact DataCite DOI, Zenodo record, or GitHub commit artifacts.
3. Activation freezes the package as `ACTIVE`. Initial drafts are activated by their creator. Successor proposals are permissionless to create, but canonical succession requires explicit activation by the active predecessor authority, atomically superseding the predecessor and advancing the canonical pointer. This ensures on-chain authority continuity rather than proving off-chain DOI control.
4. After the assessment interval, any caller may request a fresh public-evidence assessment.
5. Strict validator agreement stores one decision per artifact and deterministically derives `READY`, `DEGRADED`, `UNRESOLVED`, or `BLOCKED`.
6. A reviewer can inspect the current profile and decisions, while downstream systems can call `is_artifact_set_ready`, `has_regressed`, or `get_active_profile`.

## Architecture

```text
Public evidence sources
        ↓ validator fetch and classification
GenLayer Intelligent Contract
        ↓ authoritative profiles, decisions, and status
React workbench / downstream read clients
```

- `contracts/` contains the Intelligent Contract and the only authoritative state transition logic.
- `frontend/` provides profile inspection, registration, activation, assessment, wallet selection, transaction reconciliation, and exact contract readback. It does not independently classify evidence.
- `tests/` covers contract invariants and fail-closed evidence behavior.
- `docs/` contains the approved specification and release verification evidence.
- Public APIs remain the evidence source of the validator decision; their raw bodies are never treated as application state.

## Intelligent Contract

### Actors and state machine

A draft creator controls their draft's mutation. For an initial profile, the draft creator activates it. For a successor profile, creating and populating the draft is a permissionless proposal, while canonical succession requires an on-chain activation transaction by the active predecessor's authority, which atomically supersedes the predecessor and updates the canonical active pointer. This provides on-chain authority continuity without claiming off-chain DOI ownership proof or challenge-recovery mechanisms. Any caller may assess an active profile after the minimum delay. The native GenVM upgrader alone may replace code. Profiles move from `DRAFT` to `ACTIVE`; a successor atomically supersedes an active predecessor. Assessments append epochs without rewriting prior decisions.

### Public API

Writes:

- `create_profile(canonical_work_doi, previous_profile_id)`
- `add_artifact(profile_id, artifact_type, source_kind, canonical_source_id, expected_relationship, expected_version, declared_digest, license_required, restricted_access_allowed, license_path)` — returns the transaction-specific artifact index
- `activate_profile(profile_id)`
- `assess_profile(profile_id)`
- `upgrade(new_code)` — restricted by GenVM to the registered upgrader

Views:

- `get_profile_count()`
- `get_profile(profile_id)`
- `get_artifact(profile_id, artifact_index)`
- `get_current_status(profile_id)`
- `get_assessment(profile_id, epoch)`
- `get_artifact_decision(profile_id, epoch, artifact_index)`
- `is_artifact_set_ready(profile_id)`
- `has_regressed(profile_id)`
- `get_min_assessment_delay_seconds()`
- `get_active_profile(canonical_work_doi)`
- `get_upgrader()`

### Decision vocabulary

| Dimension | Values |
|---|---|
| Identity | `MATCH`, `MISMATCH`, `UNRESOLVED` |
| Access | `AVAILABLE`, `RESTRICTED_DISCLOSED`, `MISSING`, `UNRESOLVED` |
| Version | `ALIGNED`, `SUPERSEDED`, `CONFLICT`, `UNRESOLVED` |
| License | `DECLARED`, `ABSENT`, `CONFLICT`, `NOT_APPLICABLE`, `UNRESOLVED` |

### Consensus binding

| Field | Source | Stored | Downstream effect | Binding mode |
|---|---|---:|---|---|
| `source_id` | Canonical declaration | Yes | Decision identity | Strict exact |
| `identity` | Public evidence | Yes | Can block package | Strict exact |
| `access` | Public evidence | Yes | Can degrade or block | Strict exact |
| `version` | Public evidence | Yes | Can degrade or block | Strict exact |
| `license` | Public evidence | Yes | Can block when required | Strict exact |
| `overall_status` | Decision set | Yes | Oracle result | Deterministic derivation |
| `has_regressed` | Previous/current status | Yes | Downstream warning | Deterministic derivation |

The model must return one exact ordered schema. Unknown fields, missing decisions, unsupported enums, reordering, malformed output, or non-agreement fail closed without a state write.

## Transaction lifecycle

Wallet connection always opens a provider selector; no wallet is selected automatically. A write proceeds through signing, pending, `FINALIZED`, successful leader execution, explicit `AGREE` or `MAJORITY_AGREE`, and authoritative readback. Creation and artifact registration decode their identity from the exact successful transaction return rather than an aggregate counter.

The frontend saves the submitted hash and expected fields before polling. A transient RPC error leaves that record intact, blocks duplicate submission, and offers reconciliation of the same hash. The record is cleared only after terminal success and exact readback. Disagreement, execution failure, malformed receipts, unknown terminal state, or readback mismatch is shown as an error rather than success.

## Run locally

Prerequisites: Python 3.12, Node.js, npm, `uv`, and `genvm-lint`.

Create `frontend/.env.local` with the verified deployment:

```dotenv
VITE_GENLAYER_CONTRACT_ADDRESS=0xD0bB9C0D436092d7bBB03F2458C60473739923EC
```

Then run:

```powershell
uv sync --frozen
.venv\Scripts\python.exe -m pytest tests -q
genvm-lint.exe check contracts\research_artifact_integrity_covenant.py
cd frontend
npm ci
npm run dev
```

## Tests and verification

```powershell
.venv\Scripts\python.exe -m pytest tests -q
genvm-lint.exe check contracts\research_artifact_integrity_covenant.py
cd frontend
npm run lint
npm test
npm run build
```

Current reviewed results: 28 contract tests passed; GenVM lint and semantic validation passed; frontend lint passed; 24 frontend tests passed; production build passed. The complete transaction matrix, deployed-source parity, recovery rehearsal, frontend failure recovery, and known notices are recorded in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

## Deployment and recovery

The frontend production environment must set `VITE_GENLAYER_CONTRACT_ADDRESS` to the verified Studionet address above. No fallback or placeholder address is accepted. Production assets must be inspected after deployment to confirm that the compiled address and RPC target match the reviewed release.

The contract is intentionally upgradable. The selected external deployment wallet is its native GenVM upgrader. If Studio loses local UI state while Studionet remains intact, import the recorded address and verify committed-source parity before any upgrade. If Studionet resets, redeploy the exact reviewed source, repeat the live journeys and readback, then update frontend configuration and release evidence. Storage declaration order and types must remain compatible unless a separately reviewed migration is supplied.

## Security and trust boundaries

- User text and fetched web content are untrusted evidence, never prompt instructions.
- Canonical identifiers, lengths, artifact count, authority, lifecycle, duplicate sources, and license paths are validated before consensus.
- Web bodies and license content are bounded. Transport status `0`, HTTP `429`, and HTTP `500–599` become `UNRESOLVED`; unavailable required-license evidence cannot become `ABSENT` or `BLOCKED`.
- Exact-object `404/410` retains the documented missing/absent meaning. Malformed or non-consensual output writes nothing.
- An assessment cannot be replayed inside the 60-second minimum interval.
- Unauthorized callers cannot replace contract code.
- The frontend treats contract JSON and receipts as untrusted protocol boundaries and projects only validated fields into the UI.

## Known limitations

- Evidence sources are limited to DataCite DOI records, Zenodo records, GitHub exact commits, Crossref work metadata, and an optional exact-commit license path.
- Public endpoints may be temporarily unavailable; transport uncertainty is not converted into a substantive negative claim.
- The covenant verifies declared artifact integrity dimensions, not the contents or merit of the research itself.
- A package holds at most three artifacts to bound validator work and consensus cost.
- Studionet is a development network and may reset.

## License

MIT
