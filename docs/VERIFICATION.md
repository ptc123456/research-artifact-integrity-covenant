# Research Artifact Integrity Covenant — Verification

## Release boundary

- Submission category: `PROJECT`
- Network: GenLayer Studionet (`61999`)
- Contract: [`0xD0bB9C0D436092d7bBB03F2458C60473739923EC`](https://explorer-studio.genlayer.com/address/0xD0bB9C0D436092d7bBB03F2458C60473739923EC)
- Deployment transaction: [`0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82`](https://explorer-studio.genlayer.com/tx/0x260fb01f6ca25fed38d06ef315beb03c1738f321a7a659edcbfa447c3d4ecf82)
- Live web: [research-artifact-integrity-covenan.vercel.app](https://research-artifact-integrity-covenan.vercel.app)
- Vercel project: `shingg/research-artifact-integrity-covenant`
- Production deployment: `dpl_78mECrKtcsrPh5RvEs5B7zeG8qdR`
- Current upgraded contract source commit: `03654be58396e0fe12b9fc8054c48314964a65b2`
- Final frontend remediation commit: `0aa3306aa3b811931c7a3a9b23e8979471dcb93a`
- Current deployed source SHA-256: `C9662F97213AEFEA61A2E6B10BF2B5F2CBD2B696898D1232FCA98A15BEAF50CF`

The immutable checkpoint package records the exact package commit and tree after this document is committed. That external binding avoids a self-referential commit hash inside the commit whose identity it would change.

## Deployment and recovery verification

The main deployment finalized with validator agreement and successful leader execution. RPC code readback matched the committed contract bytes, the registered upgrader was `0x277bF20771129ae224042d23b0311C1AC5a9AC1b`, the initial profile count was zero, and the minimum assessment delay was 60 seconds.

Upgrade recovery was rehearsed on the isolated Studionet contract `0xdDAc6ab09c25FfB1F3Fc1BCF964085dB9d7432fc`. The exact approved source bytes were encoded mechanically as Studio `b#<hex>`, reverse-decoded, and rehashed before use. The authorized upgrade finalized with agreement and successful execution while preserving `profile-000001`. An unauthorized caller then produced the expected leader rollback; code, upgrader, count, and profile state remained unchanged. This rehearsal is recovery evidence, not a claim that the main deployment was upgraded.

The main contract was upgraded in transaction `0xcaf5a7e166009e936054c3fc02d140699cc1d307d1c9127f0af3fc3d367dcd0c` by the registered upgrader. It finalized with three agreeing validators and successful leader execution. The leader calldata contained the exact 27,531 reviewed source bytes at SHA-256 `C9662F97213AEFEA61A2E6B10BF2B5F2CBD2B696898D1232FCA98A15BEAF50CF`. Readback preserved profile count `2`, upgrader identity, `profile-000002`, and its canonical pointer before the successor test.

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
| Registered upgrader | Upgrade the main contract to the reviewed remediation | `upgrade` | [`0xcaf5a7…7dcd0c`](https://explorer-studio.genlayer.com/tx/0xcaf5a7e166009e936054c3fc02d140699cc1d307d1c9127f0af3fc3d367dcd0c) | `FINALIZED`, three agree, leader `SUCCESS` | exact reviewed source bytes; upgrader and two existing profiles preserved |
| External proposer wallet | Create a successor proposal | `create_profile` | [`0x726a77…92451`](https://explorer-studio.genlayer.com/tx/0x726a77efdb6e1e6ca363072040d9d7afb20bf802b4001bbb0382b7b54ec92451) | `FINALIZED`, three agree, leader `SUCCESS` | exact return `profile-000003`; authority is proposer; predecessor is `profile-000002` |
| Predecessor authority, wrong draft owner | Attempt to modify the proposer draft | `add_artifact` | [`0xf7995d…141be`](https://explorer-studio.genlayer.com/tx/0xf7995d1929d82ddbe0344ce0b665e0e2399a9cd34990871b9b07bb99261141be) | `FINALIZED`, three agree, expected leader error | `Only the profile authority can change this draft`; no state mutation |
| External proposer wallet | Bind one exact Zenodo artifact | `add_artifact` | [`0x2ce6e6…b66b4`](https://explorer-studio.genlayer.com/tx/0x2ce6e6c63e1c7b789695d98ab5ce01ff74bb9439860f1fe0f8f9487e4aab66b4) | `FINALIZED`, three agree, leader `SUCCESS` | successor artifact count `1`; state hash advanced |
| External proposer wallet | Attempt unauthorized canonical activation | `activate_profile` | [`0x7625dd…b0805`](https://explorer-studio.genlayer.com/tx/0x7625ddda73c792c773ecbfafd920328fbc660792e91de0972a15e830071b0805) | `FINALIZED`, four agree, expected leader error | predecessor-authority error; state hash unchanged; no canonical mutation |
| Active predecessor authority | Approve and activate the successor | `activate_profile` | [`0xce09a9…1b027`](https://explorer-studio.genlayer.com/tx/0xce09a9aaafd03dd4745dd29b76131fb94e34db8d9c19520340b8a7dcfe91b027) | `FINALIZED`, three agree, leader `SUCCESS` | `profile-000002` `SUPERSEDED`; `profile-000003` `ACTIVE`; canonical pointer is `profile-000003` |
| Any caller (predecessor authority used) | Assess the canonical successor | `assess_profile` | [`0x5493ca…bc38`](https://explorer-studio.genlayer.com/tx/0x5493ca9cf06aeb01bbfa454981f42e8358d788283795fcca78810c7b6bb9bc38) | `FINALIZED`, three agree, leader `SUCCESS` | `profile-000003`, epoch `1`, `READY`, no regression, artifact count `1` |
| Browser-wallet proposer | Create a successor whose predecessor authority exists only in Studio | `create_profile` | [`0x94f2f3…c4bdd`](https://explorer-studio.genlayer.com/transactions/0x94f2f3b80b43c99749a4240a2cfaec54157b3ead7266f9ba3fd02678ee8c4bdd) | `FINALIZED`, three agree, leader `SUCCESS` | exact return `profile-000004`; predecessor `profile-000003`; frontend exact readback |
| Browser-wallet proposer | Bind exact evidence to the successor proposal | `add_artifact` | [`0xd6956d…e5d9e`](https://explorer-studio.genlayer.com/transactions/0xd6956d29fb5877935b1d1fe489dbc44902721692187da4bf8a62c231bede5d9e) | `FINALIZED`, four agree, leader `SUCCESS` | artifact index `0`; exact fields; frontend readback; proposal remains `DRAFT` because its predecessor key is Studio-only |
| Browser-wallet authority | Create a fresh browser-owned initial profile | `create_profile` | [`0x2f55b9…652a0`](https://explorer-studio.genlayer.com/transactions/0x2f55b9d46639ded496f2d857ac01d1f8d2b40fed7bb4d9bc72b000d79e7652a0) | `FINALIZED`, three agree, leader `SUCCESS` | exact return `profile-000005`; DOI `10.5281/zenodo.4923709`; no predecessor |
| Browser-wallet authority | Bind exact Zenodo evidence | `add_artifact` | [`0x525ec7…7e5b9`](https://explorer-studio.genlayer.com/transactions/0x525ec77328c07c8ab6fe222e36966aee690b849cea0dc76a4513cafa0707e5b9) | `FINALIZED`, three agree, leader `SUCCESS` | artifact index `0`; exact fields and frontend readback |
| Browser-wallet authority | Activate the browser-owned initial profile | `activate_profile` | [`0x5a1810…77572`](https://explorer-studio.genlayer.com/tx/0x5a181058da57a69b756db6b01a832efb9dd1137b2c0f21a1fefb5ede36c77572) | `FINALIZED`, three agree, leader `SUCCESS` | `profile-000005` `ACTIVE`; canonical pointer and authority verified |
| Browser-wallet proposer | Create and populate a successor proposal | `create_profile`, `add_artifact` | [`0x5238fa…30f54`](https://explorer-studio.genlayer.com/transactions/0x5238fafb014b8058b71f9ce98b9480226ea7f70a47ba761403a70b389b130f54), [`0xa329d7…ce69c`](https://explorer-studio.genlayer.com/transactions/0xa329d75f919c6016d45c7fe1386582668533faaa8828f391b137e5d5e26ce69c) | both `FINALIZED`, three agree, leader `SUCCESS` | exact return `profile-000006`; artifact index `0`; predecessor `profile-000005`; exact readbacks |
| Active browser predecessor authority | Approve the canonical successor | `activate_profile` | [`0x145662…90e82`](https://explorer-studio.genlayer.com/transactions/0x145662384b2b9d36d468da655e002ec6c6c2166da22f9ebc4b7cb66d9cb90e82) | `FINALIZED`, four agree, leader `SUCCESS` | `profile-000006` `ACTIVE`; `profile-000005` superseded; canonical pointer moved; frontend readback verified |
| Browser wallet | Assess the final canonical profile | `assess_profile` | [`0x795647…a61df`](https://explorer-studio.genlayer.com/transactions/0x7956477ab5d8044cca83a6fa81af2b5df891fd2b29154f474e268ebdf2ca61df) | `FINALIZED`, three agree, leader `SUCCESS` | epoch `1`; `READY`; `MATCH / AVAILABLE / ALIGNED / DECLARED`; frontend readback verified |

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

The current canonical successor `profile-000003` was independently assessed after activation. Epoch `1` finalized as `READY` with no regression and one artifact; its authoritative profile readback records assessment count `1` and current status `READY`.

## Frontend verification

The local production-configured frontend used the real main contract address with no fallback. Browser verification loaded `profile-000002` and displayed its exact DOI, lifecycle, artifact, epoch, four decisions, and `READY` result. The wallet action opened a provider-selection dialog and made no automatic connection request. Register and assess workflows were reachable, and disconnected writes remained disabled.

A wallet-connected frontend assessment returned transaction `0xbdb4a0aec89c08c47dcce9069223156b5049732e468c38b5d0f25bc0646442b4`, then the first receipt poll encountered a transient `Failed to fetch` RPC error. The frontend retained the exact pending hash, exposed reconciliation instead of encouraging a duplicate write, and later reached all four UI milestones: signed, finalized, execution succeeded, and readback verified. Independent SDK readback confirmed epoch `2`, `READY`, the exact four artifact decisions, and no regression.

Responsive inspection passed at widths `1280`, `768`, `414`, `375`, and `320` CSS pixels with no horizontal overflow. No browser console errors or warnings were observed during the readback journey.

The live Studionet receipt for activation contained a successful execution receipt followed by an idle/error receipt. The shared frontend parser was corrected to select a successful leader return, recognize the SDK's current snake-case aliases, still require explicit `AGREE` or `MAJORITY_AGREE`, and reject receipts with no successful execution. A captured-shape regression now covers this case.

## Production web verification

Vercel production status was `READY` under the selected `shingg` team. The persistent Production environment contains `VITE_GENLAYER_CONTRACT_ADDRESS`, and the compiled JavaScript contains the exact main contract address plus the Studionet RPC. Bradbury text appears only inside the GenLayer SDK's bundled static chain definitions; the application runtime configuration selects Studionet.

The final production HTML loaded successfully from the stable public alias. Its primary JavaScript bundle matched the reviewed local production build byte for byte and contained the exact Studionet contract address. The primary production asset hashes were:

- `index-Ybolrzyf.js`: `1D689B4D2E494917CA14F0790C8812F3DBB44C072FAB2D8550BE49D99726B17D`
- `index-B36NvsqG.css`: `1C885BBD25481CC40BAE52C95B4A6E434CC63082DA11C7DBEEA6ECB7CDBF9C40`

The human user executed the mandatory E2E matrix on this exact final production release. The wallet action displayed the complete detected supported set—Rabby, OKX, and MetaMask—with provider icons and no automatic selection. A legacy MetaMask provider received the bundled official fox fallback icon. A stale approval error cleared when navigating from Register to Browse. The user then executed the complete browser-wallet journey recorded above: initial creation, exact artifact registration, activation, successor creation and registration, predecessor-authorized canonical approval, assessment, and authoritative Browse readback. Every submitted write reached signed, finalized, execution-success, and readback-verified UI milestones. The final displayed state was `profile-000006`, `ACTIVE`, epoch `1`, `READY`, source `4923709`, and `MATCH / AVAILABLE / ALIGNED / DECLARED`.

The same final release also demonstrated the denial branch: while connected as an authority that did not match the active predecessor, the successor facts and canonical pointer loaded correctly and the approval button remained disabled. The separate `profile-000004` proposal remains `DRAFT` because its active predecessor authority is a Studio-only account that cannot sign through an injected browser wallet; no unauthorized canonical mutation occurred.

## Reproducible local checks

## Studionet RPC call budget

The shared read boundary was instrumented with `rpcMetrics` and regression spies. Counts below are physical SDK read calls for the current one-artifact demo shape; rerenders add zero calls because reads are event-driven rather than effect-driven.

| Journey | Maximum contract reads | Writes/pollers | Invalidation boundary |
|---|---:|---:|---|
| Fresh page / rerender | 0 | 0 | none |
| Browse `profile-000006` | 4: profile, artifact, assessment, decision | 0 | a new explicit lookup supersedes and aborts the prior lookup |
| Load successor approval facts | 3: successor, predecessor, canonical pointer | 0 | account/network/disconnect clears safe cache |
| Create draft | 1 authoritative profile readback | 1 write, 1 bounded finality loop | cache cleared before readback |
| Add artifact | 2: pre-write profile plus authoritative artifact readback | 1 write, 1 bounded finality loop | cache cleared before readback |
| Activate initial/successor | at most 3 authoritative profile/pointer reads | 1 write, 1 bounded finality loop | cache cleared before readback |
| Assess | 2: pre-write profile plus authoritative assessment readback | 1 write, 1 bounded finality loop | cache cleared before readback |
| Reconcile saved transaction | 1–3 according to saved method | 0 new writes, 1 bounded finality loop | cache cleared before readback |

Identical concurrent reads produce one physical call; a short two-second cache suppresses immediate duplicate safe reads. Transient reads make at most three physical attempts. Writes are never retried. Finality polling performs one SDK receipt request per visible four-second interval, pauses while the page is hidden, and is aborted on disconnect or component teardown.

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
