import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Check, ChevronRight, CircleDot, Command,
  FileCheck2, Fingerprint, FlaskConical, LoaderCircle, Plus, Search, ShieldCheck, Unplug, Wallet,
} from "lucide-react";
import {
  connectWallet, getProfileCount, loadPendingTransaction, readArtifact, readAssessment,
  readDecision, readProfile, reconcilePending, submitWrite,
  type PendingTransaction, type StringRecord, type TransactionProgress,
} from "./lib/genlayer";
import { configurationError, contractAddress, STUDIONET_CHAIN_HEX, STUDIONET_EXPLORER_URL } from "./lib/config";
import { discoverWalletProviders, type WalletProviderDetail } from "./lib/walletProviders";

type View = "browse" | "register" | "assess";
type ArtifactDraft = {
  artifactType: string; sourceKind: string; sourceId: string; relationship: string; version: string;
  digest: string; licenseRequired: boolean; restrictedAllowed: boolean; licensePath: string;
};

const emptyArtifact = (): ArtifactDraft => ({
  artifactType: "DATA", sourceKind: "DATACITE_DOI", sourceId: "", relationship: "",
  version: "", digest: "", licenseRequired: false, restrictedAllowed: false, licensePath: "",
});

const compact = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const numberField = (record: StringRecord | null, key: string) => Number(record?.[key] ?? 0);

function StatusPill({ value }: { value: string }) {
  const normalized = value || "NOT ASSESSED";
  return <span className={`status status-${normalized.toLowerCase().replaceAll("_", "-")}`}>{normalized}</span>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}<small aria-hidden={!hint}>{hint ?? "\u00a0"}</small></label>;
}

function TransactionRail({ progress, onReconcile, busy }: {
  progress: TransactionProgress | null; onReconcile: () => void; busy: boolean;
}) {
  const pending = loadPendingTransaction();
  return <aside className="transaction-rail" aria-live="polite">
    <div className="eyebrow light"><CircleDot size={14} /> transaction control</div>
    <h2>{progress?.stage === "success" ? "Verified on-chain" : progress ? "Action in progress" : "No active transaction"}</h2>
    <p>{progress?.message ?? "Writes require a selected wallet, Studionet finality, successful execution, and contract readback."}</p>
    {progress?.hash && <a href={`${STUDIONET_EXPLORER_URL}/transactions/${progress.hash}`} target="_blank" rel="noreferrer">
      {compact(progress.hash)} <ArrowUpRight size={14} />
    </a>}
    {pending && <button className="button inverse" onClick={onReconcile} disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} Reconcile pending transaction
    </button>}
    <ol className="rail-steps">
      {["Signed", "Finalized", "Execution succeeded", "Readback verified"].map((item, index) => {
        const rank = progress ? ["signing", "pending", "finalized", "readback", "success"].indexOf(progress.stage) : -1;
        return <li key={item} className={rank > index ? "done" : rank === index ? "current" : ""}>{item}</li>;
      })}
    </ol>
  </aside>;
}

export default function App() {
  const [view, setView] = useState<View>("browse");
  const [providers, setProviders] = useState<WalletProviderDetail[]>([]);
  const [wallet, setWallet] = useState<WalletProviderDetail | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<TransactionProgress | null>(null);
  const walletDialog = useRef<HTMLDialogElement>(null);
  const commandDialog = useRef<HTMLDialogElement>(null);

  const [lookupId, setLookupId] = useState("");
  const [profile, setProfile] = useState<StringRecord | null>(null);
  const [artifacts, setArtifacts] = useState<StringRecord[]>([]);
  const [assessment, setAssessment] = useState<StringRecord | null>(null);
  const [decisions, setDecisions] = useState<StringRecord[]>([]);

  const [doi, setDoi] = useState("");
  const [previousId, setPreviousId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [artifact, setArtifact] = useState<ArtifactDraft>(emptyArtifact);
  const [assessId, setAssessId] = useState("");

  useEffect(() => discoverWalletProviders(setProviders), []);
  useEffect(() => {
    if (!wallet?.provider.on) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        setAccount(""); setNotice("The selected wallet disconnected its account."); return;
      }
      setAccount(accounts[0]);
    };
    const chainChanged = (...args: unknown[]) => {
      if (String(args[0]).toLowerCase() !== STUDIONET_CHAIN_HEX) {
        setAccount(""); setNotice("Wallet network changed. Reconnect and select GenLayer Studionet before writing.");
      }
    };
    wallet.provider.on("accountsChanged", accountsChanged);
    wallet.provider.on("chainChanged", chainChanged);
    return () => {
      wallet.provider.removeListener?.("accountsChanged", accountsChanged);
      wallet.provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [wallet]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); commandDialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const canWrite = Boolean(contractAddress && wallet && account) && !busy;
  const report = (next: TransactionProgress) => setProgress(next);

  async function run(task: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await task(); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function selectWallet(selected: WalletProviderDetail) {
    await run(async () => {
      const selectedAccount = await connectWallet(selected);
      setWallet(selected); setAccount(selectedAccount); walletDialog.current?.close();
    });
  }

  function disconnect() { setWallet(null); setAccount(""); setProgress(null); }

  async function loadProfile(id = lookupId) {
    const normalized = id.trim();
    if (!normalized) throw new Error("Enter a profile ID.");
    const nextProfile = await readProfile(normalized);
    if (!nextProfile.profile_id) throw new Error("Profile not found.");
    const count = numberField(nextProfile, "artifact_count");
    const epoch = numberField(nextProfile, "assessment_count");
    const nextArtifacts = await Promise.all(Array.from({ length: count }, (_, index) => readArtifact(normalized, index)));
    const nextAssessment = epoch ? await readAssessment(normalized, epoch) : null;
    const nextDecisions = epoch ? await Promise.all(Array.from({ length: count }, (_, index) => readDecision(normalized, epoch, index))) : [];
    setLookupId(normalized); setProfile(nextProfile); setArtifacts(nextArtifacts);
    setAssessment(nextAssessment); setDecisions(nextDecisions);
  }

  function requireWallet(): { wallet: WalletProviderDetail; account: string } {
    if (!wallet || !account) throw new Error("Select a wallet provider before signing.");
    return { wallet, account };
  }

  async function createProfile() {
    await run(async () => {
      const signer = requireWallet();
      const expectedId = `profile-${String((await getProfileCount()) + 1).padStart(6, "0")}`;
      await submitWrite(signer.wallet, signer.account, "create_profile", [doi, previousId], expectedId, async () => {
        const result = await readProfile(expectedId);
        if (result.state !== "DRAFT" || result.authority.toLowerCase() !== signer.account.toLowerCase()) throw new Error("Created profile did not match the signed request.");
      }, report);
      setDraftId(expectedId); setLookupId(expectedId);
    });
  }

  async function addArtifact() {
    await run(async () => {
      const signer = requireWallet();
      const before = await readProfile(draftId);
      if (before.state !== "DRAFT") throw new Error("The selected profile is not an editable draft.");
      const index = numberField(before, "artifact_count");
      await submitWrite(signer.wallet, signer.account, "add_artifact", [
        draftId, artifact.artifactType, artifact.sourceKind, artifact.sourceId, artifact.relationship,
        artifact.version, artifact.digest, artifact.licenseRequired, artifact.restrictedAllowed, artifact.licensePath,
      ], `${draftId}:${index}`, async () => {
        const result = await readArtifact(draftId, index);
        if (!result.canonical_source_id) throw new Error("Artifact was not present in contract readback.");
      }, report);
      setArtifact(emptyArtifact());
    });
  }

  async function activateProfile() {
    await run(async () => {
      const signer = requireWallet();
      await submitWrite(signer.wallet, signer.account, "activate_profile", [draftId], draftId, async () => {
        const result = await readProfile(draftId);
        if (result.state !== "ACTIVE") throw new Error("Profile activation was not reflected in contract state.");
      }, report);
      setLookupId(draftId); await loadProfile(draftId); setView("browse");
    });
  }

  async function assessProfile() {
    await run(async () => {
      const signer = requireWallet();
      const before = await readProfile(assessId);
      const expectedEpoch = numberField(before, "assessment_count") + 1;
      await submitWrite(signer.wallet, signer.account, "assess_profile", [assessId], `${assessId}:${expectedEpoch}`, async () => {
        const result = await readAssessment(assessId, expectedEpoch);
        if (numberField(result, "epoch") !== expectedEpoch || !result.overall_status) throw new Error("Assessment readback was incomplete.");
      }, report);
      setLookupId(assessId); await loadProfile(assessId); setView("browse");
    });
  }

  async function reconcile() {
    await run(async () => {
      await reconcilePending(async (pending: PendingTransaction) => {
        if (pending.method === "create_profile") {
          const result = await readProfile(pending.expectedId); if (result.state !== "DRAFT") throw new Error("Recovered profile readback failed.");
        } else if (pending.method === "add_artifact") {
          const [id, index] = pending.expectedId.split(":"); const result = await readArtifact(id, Number(index));
          if (!result.canonical_source_id) throw new Error("Recovered artifact readback failed.");
        } else if (pending.method === "activate_profile") {
          const result = await readProfile(pending.expectedId); if (result.state !== "ACTIVE") throw new Error("Recovered activation readback failed.");
        } else if (pending.method === "assess_profile") {
          const [id, epoch] = pending.expectedId.split(":"); const result = await readAssessment(id, Number(epoch));
          if (!result.overall_status) throw new Error("Recovered assessment readback failed.");
        } else throw new Error("Unknown pending method; refusing to infer a readback.");
      }, report);
    });
  }

  const navigate = (next: View) => { setView(next); commandDialog.current?.close(); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Research Artifact Integrity Covenant home">
        <Fingerprint size={22} /><span>Research Artifact<br />Integrity Covenant</span>
      </a>
      <nav aria-label="Primary navigation">
        {(["browse", "register", "assess"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}
      </nav>
      <div className="header-actions">
        <span className="network"><i /> Studionet</span>
        <button className="command-button" onClick={() => commandDialog.current?.showModal()} aria-label="Open workflow navigation"><Search size={16} /><kbd>⌘K</kbd></button>
        {account ? <button className="wallet-button connected" onClick={disconnect}><Unplug size={16} />{compact(account)}</button>
          : <button className="wallet-button" onClick={() => walletDialog.current?.showModal()}><Wallet size={16} />Connect wallet</button>}
      </div>
    </header>

    <main id="top">
      <section className="intro">
        <div><div className="eyebrow"><FlaskConical size={15} /> evidence-bound research infrastructure</div>
          <h1>Make an artifact package<br /> <em>legible before it is trusted.</em></h1>
        </div>
        <p>Register exact public evidence references, then let GenLayer assess identity, access, version alignment, and license declarations. This covenant does not judge scientific correctness.</p>
      </section>

      {(configurationError || notice) && <div className={`alert ${notice ? "error" : ""}`} role="alert"><AlertTriangle size={19} /><div><strong>{notice ? "Action needs attention" : "Live actions unavailable"}</strong><span>{notice ?? configurationError}</span></div></div>}

      <div className="workbench">
        <section className="workspace">
          <div className="workspace-head"><div><span className="step-label">Workflow / {view}</span><h2>{view === "browse" ? "Inspect a covenant profile" : view === "register" ? "Register an artifact set" : "Run a current-evidence assessment"}</h2></div><span className="scope-note">Studionet · public evidence only</span></div>

          {view === "browse" && <div className="flow">
            <form className="lookup" onSubmit={(event) => { event.preventDefault(); void run(() => loadProfile()); }}>
              <Field label="Profile ID"><input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="profile-000001" /></Field>
              <button className="button primary" disabled={!contractAddress || busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Load profile</button>
            </form>
            {!profile ? <div className="empty-state"><FileCheck2 size={28} /><h3>No profile loaded</h3><p>Enter an exact profile ID to inspect its registered artifacts and latest assessment.</p></div>
              : <div className="record">
                <div className="record-title"><div><span className="mono">{profile.profile_id}</span><h3>{profile.canonical_work_doi}</h3></div><StatusPill value={profile.current_status} /></div>
                <dl className="facts"><div><dt>Lifecycle</dt><dd>{profile.state}</dd></div><div><dt>Artifacts</dt><dd>{profile.artifact_count}</dd></div><div><dt>Assessments</dt><dd>{profile.assessment_count}</dd></div><div><dt>Authority</dt><dd className="mono">{compact(profile.authority)}</dd></div></dl>
                <div className="artifact-list">
                  {artifacts.map((item, index) => <article key={`${item.canonical_source_id}-${index}`}>
                    <span className="artifact-index">0{index + 1}</span><div><div className="artifact-meta">{item.artifact_type} · {item.source_kind}</div><h4>{item.canonical_source_id}</h4><p>{item.expected_relationship}</p></div>
                    {decisions[index] && <div className="decision"><span>{decisions[index].identity}</span><span>{decisions[index].access}</span><span>{decisions[index].version}</span><span>{decisions[index].license}</span></div>}
                  </article>)}
                </div>
                {assessment && <div className="assessment-summary"><Check size={18} /><span>Latest epoch {assessment.epoch} · assessed {new Date(assessment.assessed_at).toLocaleString()}</span>{assessment.has_regressed === "true" && <strong>REGRESSION DETECTED</strong>}</div>}
              </div>}
          </div>}

          {view === "register" && <div className="flow register-flow">
            <div className="phase"><div className="phase-number">01</div><div className="phase-body"><h3>Create an immutable draft identity</h3><div className="form-grid">
              <Field label="Canonical work DOI"><input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1234/example" disabled={Boolean(draftId)} /></Field>
              <Field label="Previous profile ID" hint="Required only when superseding an active version."><input value={previousId} onChange={(e) => setPreviousId(e.target.value)} placeholder="Optional" disabled={Boolean(draftId)} /></Field>
            </div><button className="button primary" disabled={!canWrite || Boolean(draftId) || !doi.trim()} onClick={createProfile}>{draftId ? <Check size={17} /> : <Plus size={17} />}{draftId ? draftId : "Create draft"}</button></div></div>

            <div className={`phase ${!draftId ? "locked" : ""}`}><div className="phase-number">02</div><div className="phase-body"><h3>Add one to three exact artifacts</h3>
              <div className="form-grid thirds"><Field label="Artifact type"><select value={artifact.artifactType} onChange={(e) => setArtifact({ ...artifact, artifactType: e.target.value })}>{["DATA", "CODE", "PROTOCOL", "MODEL", "SUPPLEMENT"].map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Source kind"><select value={artifact.sourceKind} onChange={(e) => setArtifact({ ...artifact, sourceKind: e.target.value, licensePath: "" })}>{["DATACITE_DOI", "ZENODO_RECORD", "GITHUB_COMMIT"].map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Canonical source ID"><input value={artifact.sourceId} onChange={(e) => setArtifact({ ...artifact, sourceId: e.target.value })} placeholder={artifact.sourceKind === "GITHUB_COMMIT" ? "owner/repo/40-char-commit" : "Exact identifier"} /></Field></div>
              <div className="form-grid"><Field label="Expected relationship"><input value={artifact.relationship} onChange={(e) => setArtifact({ ...artifact, relationship: e.target.value })} placeholder="How this artifact relates to the work" /></Field><Field label="Expected version"><input value={artifact.version} onChange={(e) => setArtifact({ ...artifact, version: e.target.value })} placeholder="Exact expected release or version" /></Field></div>
              <div className="form-grid"><Field label="Declared digest" hint="Optional canonical or algorithm-prefixed digest."><input value={artifact.digest} onChange={(e) => setArtifact({ ...artifact, digest: e.target.value })} placeholder="sha256:…" /></Field><Field label="License path" hint="GitHub exact commits only."><input value={artifact.licensePath} onChange={(e) => setArtifact({ ...artifact, licensePath: e.target.value })} disabled={artifact.sourceKind !== "GITHUB_COMMIT"} placeholder="LICENSE" /></Field></div>
              <div className="checks"><label><input type="checkbox" checked={artifact.licenseRequired} onChange={(e) => setArtifact({ ...artifact, licenseRequired: e.target.checked })} /> License declaration required</label><label><input type="checkbox" checked={artifact.restrictedAllowed} onChange={(e) => setArtifact({ ...artifact, restrictedAllowed: e.target.checked })} /> Disclosed restricted access allowed</label></div>
              <button className="button secondary" disabled={!canWrite || !draftId || !artifact.sourceId || !artifact.relationship || !artifact.version} onClick={addArtifact}><Plus size={17} /> Add artifact</button>
            </div></div>

            <div className={`phase ${!draftId ? "locked" : ""}`}><div className="phase-number">03</div><div className="phase-body"><h3>Activate the registered set</h3><p>Activation freezes this version. Future changes require a successor profile.</p><button className="button primary" disabled={!canWrite || !draftId} onClick={activateProfile}><ShieldCheck size={17} /> Activate profile</button></div></div>
          </div>}

          {view === "assess" && <div className="flow assess-flow"><div className="assessment-copy"><span className="step-label">Intelligent Contract assessment</span><h3>Check the evidence that exists now.</h3><p>Public sources are fetched during consensus. Validators classify only the four declared integrity dimensions, using strict agreement on consequential output.</p>
            <ul><li>Artifact identity matches the exact source</li><li>Access state is explicit</li><li>Declared version remains aligned</li><li>License declaration is present where required</li></ul></div>
            <div className="assess-action"><Field label="Active profile ID"><input value={assessId} onChange={(e) => setAssessId(e.target.value)} placeholder="profile-000001" /></Field><button className="button primary wide" disabled={!canWrite || !assessId.trim()} onClick={assessProfile}>{busy ? <LoaderCircle className="spin" size={17} /> : <Command size={17} />} Assess current evidence</button><small>Assessments require at least 60 seconds after activation or the previous assessment.</small></div>
          </div>}
        </section>
        <TransactionRail progress={progress} onReconcile={reconcile} busy={busy} />
      </div>

      <section className="boundary"><div><span className="eyebrow">scope boundary</span><h2>A covenant about evidence integrity,<br />not a verdict on research truth.</h2></div><div className="boundary-list"><span>Does assess</span><p>Identity · Access · Version · License declaration</p><span>Does not assess</span><p>Scientific correctness · Reproducibility · Legal validity · Ownership</p></div></section>
    </main>

    <footer><div><Fingerprint size={19} />Research Artifact Integrity Covenant</div><p>A package is only as clear as its evidence trail.</p><a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">Built on GenLayer <ArrowUpRight size={13} /></a></footer>

    <dialog ref={walletDialog} className="modal" onClick={(e) => { if (e.target === walletDialog.current) walletDialog.current.close(); }}><div className="modal-body"><span className="step-label">Wallet provider</span><h2>Choose how to connect</h2><p>No provider is selected automatically.</p><div className="provider-list">{providers.length ? providers.map((item) => <button key={item.info.uuid} onClick={() => selectWallet(item)}>{item.info.icon ? <img src={item.info.icon} alt="" /> : <Wallet size={20} />}<span><strong>{item.info.name}</strong><small>{item.info.rdns ?? "Injected browser provider"}</small></span><ChevronRight size={18} /></button>) : <div className="empty-provider">No compatible injected wallet was discovered.</div>}</div><button className="text-button" onClick={() => walletDialog.current?.close()}>Cancel</button></div></dialog>

    <dialog ref={commandDialog} className="modal command-modal"><div className="modal-body"><span className="step-label">Navigate</span><h2>Jump to a workflow</h2><div className="command-list">{(["browse", "register", "assess"] as View[]).map((item, index) => <button key={item} onClick={() => navigate(item)}><kbd>0{index + 1}</kbd><span><strong>{item}</strong><small>{item === "browse" ? "Inspect profiles and decisions" : item === "register" ? "Create and activate an artifact set" : "Run current-evidence consensus"}</small></span><ChevronRight size={18} /></button>)}</div><button className="text-button" onClick={() => commandDialog.current?.close()}>Close</button></div></dialog>
  </div>;
}
