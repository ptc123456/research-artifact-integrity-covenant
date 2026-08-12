# Research Artifact Integrity Covenant — Verification

## Release boundary

- Submission category: `PROJECT`
- Network: GenLayer Studionet (`61999`)
- Contract: [`0xD0bB9C0D436092d7bBB03F2458C60473739923EC`](https://explorer-studio.genlayer.com/address/0xD0bB9C0D436092d7bBB03F2458C60473739923EC)
- Deployment transaction: [`0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82`](https://explorer-studio.genlayer.com/tx/0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82)
- Live web: [research-artifact-integrity-covenan.vercel.app](https://research-artifact-integrity-covenan.vercel.app)
- Vercel project: `shingg/research-artifact-integrity-covenant`
- Production deployment: `dpl_2ThFmnjvk7PaJgDyVmk2PbDvqVdk`
- Deployed contract source commit: `0e0688a7bee5dc71cffa88d468bfb625aae4e9b1`
- Frontend live-receipt correction commit: `6172c3ccbb8552aadd6c3cbcb6cda99aaa311da0`
- Deployed source SHA-256: `0DE27E5118828C8279A45509237C866D417F8823F3DCBD9AE343F2C855CE1972`

The immutable checkpoint package records the exact package commit and tree after this document is committed. That external binding avoids a self-referential commit hash inside the commit whose identity it would change.

## Deployment and recovery verification

The main deployment finalized with validator agreement and successful leader execution. RPC code readback matched the committed contract bytes, the registered upgrader was `0x277bF20771129ae224042d23b0311C1AC5a9AC1b`, the initial profile count was zero, and the minimum assessment delay was 60 seconds.

Upgrade recovery was rehearsed on the isolated Studionet contract `0xdDAc6ab09c25FfB1F3Fc1BCF964085dB9d7432fc`. The exact approved source bytes were encoded mechanically as Studio `b#<hex>`, reverse-decoded, and rehashed before use. The authorized upgrade finalized with agreement and successful execution while preserving `profile-000001`. An unauthorized caller then produced the expected leader rollback; code, upgrader, count, and profile state remained unchanged. This rehearsal is recovery evidence, not a claim that the main deployment was upgraded.

## Live proof matrix

| Actor | Action | Contract method | Transaction | Terminal evidence | Authoritative readback |
|---|---|---|---|---|---|
| Deployment/upgrader wallet | Deploy exact reviewed source | constructor | [`0x260fb0…4ecf82`](https://explorer-studio.genlayer.com/tx/0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | exact source hash; upgrader matches; count `0`; delay `60` |
| Profile authority | Create the demo profile | `create_profile` | [`0xc4ef5f…b046c2`](https://explorer-studio.genlayer.com/tx/0xc4ef5fd054d90df1946debb19be2aa38ad6355f1c2279611c03899be73b046c2) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | exact return `profile-000002`; `DRAFT`; authority and DOI match |
| Profile authority | Bind exact Zenodo evidence | `add_artifact` | [`0x26d55d…f53575`](https://explorer-studio.genlayer.com/tx/0x26d55db0698214bd336eefaf49760a5df0c92dfb404c782e37b7b65537f53575) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | exact return index `0`; all submitted fields match; count `1` |
| Profile authority | Freeze the package | `activate_profile` | [`0xed4f3f…bbb5a4`](https://explorer-studio.genlayer.com/tx/0xed4f3f68578df05bc49349ba06d8932d4992df3fd3723dd592e87ec291bbb5a4) | `FINALIZED`, `MAJORITY_AGREE`; successful execution receipt followed by an idle receipt | `profile-000002` is `ACTIVE`; activation time stored |
| Any caller (profile authority used) | Assess current public evidence | `assess_profile` | [`0xfc259f…a0b1a1`](https://explorer-studio.genlayer.com/tx/0xfc259fe080ba5fc85624516c26a8c6b389f0b043135d36df48b6900d02a0b1a1) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | epoch `1`; `READY`; oracle `true`; no regression |
| Connected frontend wallet | Recover assessment after transient RPC failure | `assess_profile` | [`0xbdb4a0…6442b4`](https://explorer-studio.genlayer.com/transactions/0xbdb4a0aec89c08c47dcce9069223156b5049732e468c38b5d0f25bc0646442b4) | `FINALIZED`, `MAJORITY_AGREE`, two leader `SUCCESS` returns | pending hash reconciled without resubmission; epoch `2`; `READY`; exact decision readback; no regression |
| Isolated upgrader | Replace with exact same reviewed source | `upgrade` | [`0xeecade…f1d4a`](https://explorer-studio.genlayer.com/tx/0xeecade545e64902a988af7f4bb7f3025f99643b7934333d454de4dc4fb3f1d4a) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | exact source and upgrader preserved; profile state preserved |
| Unauthorized rehearsal wallet | Attempt code replacement | `upgrade` | [`0xca3c75…e8cab9`](https://explorer-studio.genlayer.com/tx/0xca3c758f6324289d669efccd3fc84b059afad002ac5f807d8b319a8097e8cab9) | `FINALIZED`, `MAJORITY_AGREE`, leader rollback | exact source, upgrader, count, and profile unchanged |

The first main-contract profile ID is not used as release evidence because it was created accidentally from a secondary wallet. The complete verified reviewer journey is `profile-000002`, whose transaction-specific return and exact fields were read back independently.

## Consensus result

For assessment epoch `2`, submitted and recovered through the frontend, the contract stored:

- identity: `MATCH`
- access: `AVAILABLE`
- version: `ALIGNED`
- license: `DECLARED`
- overall status: `READY`
- `is_artifact_set_ready("profile-000002")`: `true`
- `has_regressed("profile-000002")`: `false`

The evidence sources were Crossref DOI metadata and exact Zenodo record `4923709`. The contract itself fetched and classified these sources during validator execution; the frontend only renders contract readback.

## Frontend verification

The local production-configured frontend used the real main contract address with no fallback. Browser verification loaded `profile-000002` and displayed its exact DOI, lifecycle, artifact, epoch, four decisions, and `READY` result. The wallet action opened a provider-selection dialog and made no automatic connection request. Register and assess workflows were reachable, and disconnected writes remained disabled.

A wallet-connected frontend assessment returned transaction `0xbdb4a0aec89c08c47dcce9069223156b5049732e468c38b5d0f25bc0646442b4`, then the first receipt poll encountered a transient `Failed to fetch` RPC error. The frontend retained the exact pending hash, exposed reconciliation instead of encouraging a duplicate write, and later reached all four UI milestones: signed, finalized, execution succeeded, and readback verified. Independent SDK readback confirmed epoch `2`, `READY`, the exact four artifact decisions, and no regression.

Responsive inspection passed at widths `1280`, `768`, `414`, `375`, and `320` CSS pixels with no horizontal overflow. No browser console errors or warnings were observed during the readback journey.

The live Studionet receipt for activation contained a successful execution receipt followed by an idle/error receipt. The shared frontend parser was corrected to select a successful leader return, recognize the SDK's current snake-case aliases, still require explicit `AGREE` or `MAJORITY_AGREE`, and reject receipts with no successful execution. A captured-shape regression now covers this case.

## Production web verification

Vercel production status was `READY` under the selected `shingg` team. The persistent Production environment contains `VITE_GENLAYER_CONTRACT_ADDRESS`, and the compiled JavaScript contains the exact main contract address plus the Studionet RPC. Bradbury text appears only inside the GenLayer SDK's bundled static chain definitions; the application runtime configuration selects Studionet.

The production HTML loaded successfully and its six referenced JavaScript/CSS assets matched the reviewed local production build byte for byte. The primary production asset hashes were:

- `index-BmAPovNO.js`: `EAD16340BC7B568B33B899F132023E31ED69CF53E4E3A84E8AD22EC1B7F66D2F`
- `index-B36NvsqG.css`: `1C885BBD25481CC40BAE52C95B4A6E434CC63082DA11C7DBEEA6ECB7CDBF9C40`

Live browser readback displayed `profile-000002`, epoch `2`, `ACTIVE`, `READY`, source `4923709`, and `MATCH / AVAILABLE / ALIGNED / DECLARED`. The production wallet action opened an explicit selector stating that no provider is selected automatically. The console contained no warning or error, and widths `1280`, `768`, `414`, `375`, and `320` CSS pixels had no horizontal overflow.

## Reproducible local checks

Run from the repository root:

```powershell
uv sync --frozen
.venv\Scripts\python.exe -m pytest tests -q
genvm-lint.exe check contracts\research_artifact_integrity_covenant.py
cd frontend
npm ci
npm run lint
npm test
npm run build
```

The POST_DEPLOY_TEST package records fresh command output and hashes for the exact package revision. The disclosed Vite chunk warning is non-blocking and originates from the GenLayer SDK bundle.

## Known limitations

- Studionet is a hosted development environment and may reset; the recovery procedure requires redeployment, source parity verification, repeated live journeys, and frontend reconfiguration.
- Public evidence endpoints can be unavailable or rate-limited. Transport status `0`, HTTP `429`, and HTTP `500–599` remain `UNRESOLVED` rather than becoming a substantive negative.
- The covenant checks narrow integrity declarations. It does not determine scientific truth, reproducibility, legal validity, ownership, or research quality.
- The upgrade rehearsal replaced code with the same reviewed bytes. It does not prove an arbitrary storage migration safe.
