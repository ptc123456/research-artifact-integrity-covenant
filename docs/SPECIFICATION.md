# Research Artifact Integrity Covenant — Specification

## Product boundary

Research Artifact Integrity Covenant is a non-economic GenLayer PROJECT for research authors, curators, registries, and downstream systems that need a shared, versioned answer to a narrow question: does a declared artifact package still match independently accessible public evidence?

It assesses identity, access, version alignment, and license declaration. Scientific validity, reproducibility, legal conclusions, ownership, citation quality, and private evidence are out of scope.

## Architecture

- One Python Intelligent Contract on Studionet.
- One static React frontend using `genlayer-js` directly.
- No backend, database, indexer, staking integration, administrator verdict override, payment, or multi-contract protocol.
- Contract state is authoritative. The frontend never treats wallet submission or finality alone as a successful write.

## Domain model

### Profile

A profile identifies one immutable version of an artifact package for a canonical work DOI.

States: `DRAFT → ACTIVE → SUPERSEDED`.

- Only the creating authority can modify a draft.
- A draft must contain one to three artifacts before activation.
- An active profile is immutable.
- A successor must reference the active profile for the same DOI.
- Activating a valid successor atomically supersedes its predecessor.

### Artifact

Supported types: `DATA`, `CODE`, `PROTOCOL`, `MODEL`, `SUPPLEMENT`.

Supported public sources:

- `DATACITE_DOI`: canonical DOI.
- `ZENODO_RECORD`: numeric record ID.
- `GITHUB_COMMIT`: `owner/repository/40-character-commit`.

Each artifact binds an expected relationship, expected version, optional declared digest, license requirement, restricted-access policy, and optional GitHub repository-relative license path.

### Assessment

Each assessment epoch stores one exact decision per artifact and an overall derived status. The minimum interval is 60 seconds after activation or the previous assessment.

Overall derivation:

- `BLOCKED`: identity mismatch, missing artifact, version conflict, license conflict, or required license absent.
- `UNRESOLVED`: otherwise, any unresolved identity/access/version/license field.
- `DEGRADED`: otherwise, disclosed restricted access or a superseded version.
- `READY`: all remaining cases.

Regression is deterministically true when the new status has greater severity than the previous status under `READY < DEGRADED < UNRESOLVED < BLOCKED`.

## Consensus and evidence flow

1. Deterministic code loads and copies primitive profile/artifact declarations before creating the nondeterministic closure.
2. Validators fetch Crossref work metadata and the exact declared DataCite, Zenodo, or GitHub endpoint. An optional GitHub license path resolves against the exact commit.
3. All fetched content is bounded and placed inside an explicit untrusted-evidence delimiter.
4. The model returns only an ordered `decisions` array with exact keys and closed enums.
5. Contract validation rejects unknown keys, wrong count/order/source identity, unsupported values, malformed output, and any attempt to turn unavailable source or required-license evidence into a substantive negative.
6. `strict_eq` requires exact validator agreement on every consequential field.
7. Only after consensus does deterministic code derive and store the overall status and regression flag.

## Public state and API

Persistent state uses scalar `u256` plus flat JSON strings in typed `TreeMap` collections. Keys are deterministic profile, artifact, assessment, and decision identifiers. Public methods and integration views are listed in the root README.

There is no privileged verdict administrator and no method to overwrite an assessment. Any caller may request an assessment after the interval, but only the profile authority controls draft construction and activation. The external wallet used for deployment is registered as the native GenVM upgrader and may replace code through `upgrade(new_code)`; upgrades must preserve storage layout and require a new exact-revision review.

## Frontend transaction state machine

`IDLE → SIGNING → PENDING → FINALIZED → EXECUTION_SUCCESS → READBACK_VERIFIED`.

Any rejection, terminal non-finalized state, execution error, missing/unknown validator result, validator disagreement, malformed receipt, or readback mismatch enters `ERROR`. A submitted hash and its expected readback fields are persisted. Before another write, the frontend reconciles that exact transaction instead of blindly retrying. New profile IDs and artifact indices are decoded from the exact successful transaction return; aggregate counters are never used as transaction identity.

Wallet selection uses EIP-6963 announcements plus explicitly enumerated legacy injected providers. The user must select a provider. Studionet is switched or added only through the selected wallet; account and chain changes invalidate write readiness.

## Acceptance criteria

- Canonical input validation, ownership, lifecycle, duplicate, maximum-artifact, successor, and interval invariants fail closed.
- Validators independently evaluate public evidence and exact consequential decision fields.
- Malformed or conflicting consensus output cannot mutate assessment state.
- At least one deterministic view is suitable for downstream integration.
- Frontend contains no contract-address fallback and no automatic wallet choice.
- Every write requires `FINALIZED`, successful leader execution, validator agreement, and authoritative readback.
- Pending transaction reconciliation precedes retry.
- Required-license transport or exact-path unavailability records `UNRESOLVED`; it cannot commit `ABSENT` or `BLOCKED`, and a later successful assessment may recover.
- Contract lint and Direct Mode tests pass.
- The deployment wallet is the sole initial native upgrader; authorized replacement succeeds and unauthorized replacement is rejected.
- Frontend lint, unit tests, production build, and live responsive inspection pass at 1280×800, 768, 414, 375, and 320 CSS pixels.
- Deployment and all live evidence use Studionet only.
