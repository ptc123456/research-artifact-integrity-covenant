import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as genlayer from "./lib/genlayer";
import type { WalletProviderDetail } from "./lib/walletProviders";

let mockContractAddress: string | null = "0xD0bB9C0D436092d7bBB03F2458C60473739923EC";

vi.mock("./lib/config", () => ({
  get contractAddress() { return mockContractAddress; },
  get configurationError() { return mockContractAddress ? null : "Contract not configured. A verified Studionet deployment address is required before live actions are enabled."; },
  STUDIONET_CHAIN_ID: 61_999,
  STUDIONET_CHAIN_HEX: "0xf22f",
  STUDIONET_RPC_URL: "https://studio.genlayer.com/api",
  STUDIONET_EXPLORER_URL: "https://explorer-studio.genlayer.com",
}));

const mockWallet: WalletProviderDetail = {
  info: { uuid: "metamask-uuid", name: "MetaMask", rdns: "io.metamask" },
  provider: {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as WalletProviderDetail["provider"],
};

vi.mock("./lib/walletProviders", () => ({
  discoverWalletProviders: vi.fn((cb: (providers: WalletProviderDetail[]) => void) => {
    cb([mockWallet]);
  }),
}));

const predecessorProfile = {
  profile_id: "profile-000001",
  canonical_work_doi: "10.1234/test-work",
  previous_profile_id: "",
  state: "ACTIVE",
  authority: "0x1111111111111111111111111111111111111111",
  artifact_count: "1",
  created_at: "2026-08-10T00:00:00Z",
  activated_at: "2026-08-10T01:00:00Z",
  assessment_count: "0",
  current_status: "READY",
};

const successorProposal = {
  profile_id: "profile-000002",
  canonical_work_doi: "10.1234/test-work",
  previous_profile_id: "profile-000001",
  state: "DRAFT",
  authority: "0x2222222222222222222222222222222222222222",
  artifact_count: "1",
  created_at: "2026-08-11T00:00:00Z",
  activated_at: "",
  assessment_count: "0",
  current_status: "",
};

describe("restart-safe draft workflow", () => {
  const hash = `0x${"a".repeat(64)}` as `0x${string}`;
  beforeEach(() => {
    vi.spyOn(genlayer, "connectWallet").mockResolvedValue(successorProposal.authority);
    vi.spyOn(genlayer, "submitWrite").mockRejectedValue(new Error("Unexpected write"));
  });
  afterEach(() => vi.restoreAllMocks());

  async function connect() {
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /metamask/i }));
    await screen.findByRole("button", { name: /0x2222…2222/i });
  }

  function register() {
    fireEvent.click(within(screen.getByRole("navigation", { name: /primary navigation/i })).getByRole("button", { name: /^register$/i }));
  }

  it.each(["profile-000001", ""])("hydrates recovered creation with predecessor '%s' without a second write", async (previous) => {
    const draft = { ...successorProposal, previous_profile_id: previous, artifact_count: "0" };
    const expectedFields = { canonical_work_doi: draft.canonical_work_doi, previous_profile_id: previous, state: "DRAFT", authority: draft.authority };
    const pending = { hash, method: "create_profile", expectedId: "", expectedFields, submittedAt: "2026-08-27T00:00:00Z" };
    vi.spyOn(genlayer, "loadPendingTransaction").mockReturnValue(pending);
    vi.spyOn(genlayer, "returnedProfileId").mockReturnValue(draft.profile_id);
    vi.spyOn(genlayer, "readProfile").mockResolvedValue(draft);
    vi.spyOn(genlayer, "reconcilePending").mockImplementation(async (verify) => { await verify(pending, {}); return true; });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reconcile pending/i }));
    await screen.findByDisplayValue(draft.canonical_work_doi);
    expect(screen.getByPlaceholderText("Optional")).toHaveValue(previous);
    expect(screen.getByPlaceholderText("Optional")).toBeDisabled();
    await connect();
    expect(screen.getByRole("button", { name: previous ? /open approval workflow/i : /activate profile/i })).toBeDisabled();
    if (previous) expect(screen.queryByRole("button", { name: /^activate profile$/i })).not.toBeInTheDocument();
    expect(genlayer.readProfile).toHaveBeenCalledTimes(1);
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });

  it("fails closed when creation readback does not match the saved expectation", async () => {
    const pending = { hash, method: "create_profile", expectedId: "", expectedFields: { previous_profile_id: "profile-000009" }, submittedAt: "2026-08-27T00:00:00Z" };
    vi.spyOn(genlayer, "loadPendingTransaction").mockReturnValue(pending);
    vi.spyOn(genlayer, "returnedProfileId").mockReturnValue(successorProposal.profile_id);
    vi.spyOn(genlayer, "readProfile").mockResolvedValue(successorProposal);
    vi.spyOn(genlayer, "reconcilePending").mockImplementation(async (verify) => { await verify(pending, {}); return true; });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reconcile pending/i }));
    await screen.findByRole("alert");
    register();
    expect(screen.getByPlaceholderText("10.1234/example")).toHaveValue("");
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });

  it.each([0, 1, 3])("resumes an existing initial draft with %i artifacts and gates activation/addition", async (count) => {
    vi.spyOn(genlayer, "readProfile").mockResolvedValue({ ...successorProposal, previous_profile_id: "", artifact_count: String(count) });
    render(<App />); register(); await connect();
    fireEvent.change(screen.getByPlaceholderText("profile-XXXXXX"), { target: { value: successorProposal.profile_id } });
    fireEvent.click(screen.getByRole("button", { name: /load draft/i }));
    await screen.findByDisplayValue(successorProposal.canonical_work_doi);
    const activation = screen.getByRole("button", { name: /^activate profile$/i });
    if (count) expect(activation).toBeEnabled(); else expect(activation).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Exact identifier"), { target: { value: "10.1234/data" } });
    fireEvent.change(screen.getByPlaceholderText("How this artifact relates to the work"), { target: { value: "Data" } });
    fireEvent.change(screen.getByPlaceholderText("Exact expected release or version"), { target: { value: "1" } });
    const add = screen.getByRole("button", { name: /add artifact/i });
    if (count === 3) expect(add).toBeDisabled(); else expect(add).toBeEnabled();
    expect(genlayer.readProfile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /0x2222…2222/i }));
    expect(add).toBeDisabled(); expect(activation).toBeDisabled();
  });

  it("rechecks draft authority immediately before initial activation", async () => {
    const draft = { ...successorProposal, previous_profile_id: "" };
    vi.spyOn(genlayer, "readProfile").mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, authority: predecessorProfile.authority });
    render(<App />); register(); await connect();
    fireEvent.change(screen.getByPlaceholderText("profile-XXXXXX"), { target: { value: draft.profile_id } });
    fireEvent.click(screen.getByRole("button", { name: /load draft/i }));
    await screen.findByDisplayValue(draft.canonical_work_doi);
    fireEvent.click(screen.getByRole("button", { name: /^activate profile$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/draft authority/i);
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });

  it("restores artifact recovery to the original successor and registered count", async () => {
    const pending = { hash, method: "add_artifact", expectedId: successorProposal.profile_id, expectedFields: { artifact_type: "DATA" }, submittedAt: "2026-08-27T00:00:00Z" };
    vi.spyOn(genlayer, "loadPendingTransaction").mockReturnValue(pending);
    vi.spyOn(genlayer, "returnedArtifactIndex").mockReturnValue(0);
    vi.spyOn(genlayer, "readArtifact").mockResolvedValue({ artifact_index: "0", artifact_type: "DATA" });
    vi.spyOn(genlayer, "readProfile").mockResolvedValue(successorProposal);
    vi.spyOn(genlayer, "reconcilePending").mockImplementation(async (verify) => { await verify(pending, {}); return true; });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reconcile pending/i }));
    await screen.findByDisplayValue(successorProposal.canonical_work_doi);
    expect(screen.getByRole("button", { name: /open approval workflow/i })).toBeEnabled();
    expect(screen.getByText(/1 \/ 3 artifacts registered/)).toBeInTheDocument();
    expect(genlayer.readProfile).toHaveBeenCalledTimes(1);
    expect(genlayer.readArtifact).toHaveBeenCalledTimes(1);
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });

  it.each(["activate_profile", "assess_profile"])("shows authoritative Browse results after recovering %s", async (method) => {
    const current = { ...successorProposal, state: "ACTIVE", assessment_count: "1", current_status: "READY" };
    const pending = { hash, method, expectedId: current.profile_id + (method === "assess_profile" ? ":1" : ""), submittedAt: "2026-08-27T00:00:00Z" };
    vi.spyOn(genlayer, "loadPendingTransaction").mockReturnValue(pending);
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => id === current.profile_id ? current : { ...predecessorProfile, state: "SUPERSEDED" });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue(current.profile_id);
    vi.spyOn(genlayer, "readAssessment").mockResolvedValue({ profile_id: current.profile_id, epoch: "1", overall_status: "READY", assessed_at: "2026-08-27T00:00:00Z" });
    vi.spyOn(genlayer, "readArtifact").mockResolvedValue({ artifact_type: "DATA", source_kind: "ZENODO_RECORD", canonical_source_id: "123" });
    vi.spyOn(genlayer, "readDecision").mockResolvedValue({ identity: "MATCH" });
    vi.spyOn(genlayer, "reconcilePending").mockImplementation(async (verify) => { await verify(pending, {}); return true; });
    render(<App />); register();
    fireEvent.click(screen.getByRole("button", { name: /reconcile pending/i }));
    expect(await screen.findByText(current.canonical_work_doi)).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });

  it("keeps editing disabled when loading a replacement draft fails", async () => {
    vi.spyOn(genlayer, "readProfile").mockResolvedValueOnce(successorProposal).mockRejectedValue(new Error("RPC unavailable"));
    render(<App />); register(); await connect();
    fireEvent.change(screen.getByPlaceholderText("profile-XXXXXX"), { target: { value: successorProposal.profile_id } });
    fireEvent.click(screen.getByRole("button", { name: /load draft/i }));
    await screen.findByDisplayValue(successorProposal.canonical_work_doi);
    fireEvent.change(screen.getByPlaceholderText("profile-XXXXXX"), { target: { value: "profile-000009" } });
    fireEvent.click(screen.getByRole("button", { name: /load draft/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("RPC unavailable");
    expect(screen.getByRole("button", { name: /add artifact/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /open approval workflow/i })).toBeDisabled();
    expect(genlayer.submitWrite).not.toHaveBeenCalled();
  });
});

describe("unconfigured application", () => {
  beforeEach(() => {
    mockContractAddress = null;
  });
  afterEach(() => {
    mockContractAddress = "0xD0bB9C0D436092d7bBB03F2458C60473739923EC";
    vi.restoreAllMocks();
  });

  it("fails closed and opens an explicit provider selector", () => {
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Contract not configured");
    expect(screen.getByRole("button", { name: /load profile/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("No provider is selected automatically");
    expect(screen.getByRole("dialog").querySelector("img")).toBeInTheDocument();
  });
});

describe("register workflow: initial proposal creation vs successor proposal", () => {
  beforeEach(() => {
    mockContractAddress = "0xD0bB9C0D436092d7bBB03F2458C60473739923EC";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows initial activation journey when previous profile ID is empty", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));
    expect(screen.getByText("Activate the registered set")).toBeInTheDocument();
    expect(screen.getByText(/Initial profile activation freezes this version/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activate profile/i })).toBeInTheDocument();
  });

  it("routes a created successor to the independent approval workflow", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));

    const previousIdInput = screen.getByPlaceholderText("Optional");
    fireEvent.change(previousIdInput, { target: { value: "profile-000001" } });

    expect(screen.getByRole("heading", { name: "Successor proposal ready" })).toBeInTheDocument();
    expect(screen.getByText(/Share this profile ID with the active predecessor authority/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open approval workflow/i })).toBeDisabled();
  });

  it("explains permissionless proposal in phase 1 helper hint", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));
    expect(screen.getByText(/Anyone may propose a successor, but only the predecessor authority can approve it/i)).toBeInTheDocument();
  });
});

describe("independent predecessor approval journey from clean page", () => {
  beforeEach(() => {
    mockContractAddress = "0xD0bB9C0D436092d7bBB03F2458C60473739923EC";
    vi.spyOn(genlayer, "connectWallet").mockResolvedValue("0x1111111111111111111111111111111111111111");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function connectPredecessorWallet() {
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /metamask/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /0x1111…1111/i })).toBeInTheDocument();
    });
  }

  it("cancels active RPC activity on provider account removal and wrong-network events", async () => {
    const cancel = vi.spyOn(genlayer, "cancelRpcActivity");
    render(<App />);
    await connectPredecessorWallet();
    const on = mockWallet.provider.on as ReturnType<typeof vi.fn>;
    const accountHandler = [...on.mock.calls].reverse().find(([event]) => event === "accountsChanged")?.[1];
    const chainHandler = [...on.mock.calls].reverse().find(([event]) => event === "chainChanged")?.[1];
    expect(accountHandler).toBeTypeOf("function");
    expect(chainHandler).toBeTypeOf("function");
    act(() => accountHandler([]));
    expect(cancel).toHaveBeenCalledOnce();
    act(() => chainHandler("0x1"));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent(/network changed/i);
  });

  it("accepts an existing successor ID from a clean page without creating a local draft", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return predecessorProfile;
      throw new Error(`Profile ${id} not found`);
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000001");

    render(<App />);
    await connectPredecessorWallet();

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));

    // Switch to independent approval tab
    fireEvent.click(screen.getByRole("button", { name: /approve existing successor/i }));
    expect(screen.getByText("No successor proposal loaded")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(genlayer.readProfile).toHaveBeenCalledWith("profile-000002");
      expect(genlayer.readProfile).toHaveBeenCalledWith("profile-000001");
      expect(genlayer.readActiveProfile).toHaveBeenCalledWith("10.1234/test-work");
    });

    // Displays successor and predecessor facts
    expect(screen.getByText("Successor: profile-000002")).toBeInTheDocument();
    expect(screen.getByText("10.1234/test-work")).toBeInTheDocument();
    expect(screen.getByText("0x2222…2222")).toBeInTheDocument();
    expect(screen.getByText("profile-000001 (ACTIVE)")).toBeInTheDocument();
    expect(screen.getAllByText("0x1111…1111").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Connected wallet \(0x1111…1111\) matches the active predecessor authority/i)).toBeInTheDocument();

    const approveButton = screen.getByRole("button", { name: /approve canonical successor/i });
    expect(approveButton).toBeEnabled();
  });

  it("disables approval when connected wallet does not match predecessor authority", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return predecessorProfile;
      throw new Error(`Profile ${id} not found`);
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000001");
    // Connect as attacker / different wallet
    vi.spyOn(genlayer, "connectWallet").mockResolvedValue("0x9999999999999999999999999999999999999999");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /metamask/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /0x9999…9999/i })).toBeInTheDocument();
    });

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve existing successor/i }));

    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connected wallet \(0x9999…9999\) does not match the active predecessor authority/i)).toBeInTheDocument();
    });

    const approveButton = screen.getByRole("button", { name: /approve canonical successor/i });
    expect(approveButton).toBeDisabled();
  });

  it("submits activate_profile with exact loaded successor ID and performs authoritative readbacks", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return predecessorProfile;
      throw new Error(`Profile ${id} not found`);
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000001");

    let verifyCallback: ((receipt: unknown) => Promise<void>) | null = null;
    vi.spyOn(genlayer, "submitWrite").mockImplementation(async (_w, _a, _m, _args, _exp, _fields, verify) => {
      verifyCallback = verify;
      return (`0x${"a".repeat(64)}`) as `0x${string}`;
    });

    render(<App />);
    await connectPredecessorWallet();

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve existing successor/i }));

    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /approve canonical successor/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /approve canonical successor/i }));

    await waitFor(() => {
      expect(genlayer.submitWrite).toHaveBeenCalledWith(
        mockWallet,
        "0x1111111111111111111111111111111111111111",
        "activate_profile",
        ["profile-000002"],
        "profile-000002",
        undefined,
        expect.any(Function),
        expect.any(Function),
      );
    });

    expect(verifyCallback).not.toBeNull();

    // Verify readback logic
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return { ...successorProposal, state: "ACTIVE" };
      if (id === "profile-000001") return { ...predecessorProfile, state: "SUPERSEDED" };
      throw new Error(`Profile ${id} not found`);
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000002");

    await expect(verifyCallback!({})).resolves.toBeUndefined();

    // Failing readback where get_active_profile returns empty string must fail
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("");
    await expect(verifyCallback!({})).rejects.toThrow(/Active profile for DOI did not resolve to the successor/);

    // Failing readback where get_active_profile returns old predecessor must fail
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000001");
    await expect(verifyCallback!({})).rejects.toThrow(/Active profile for DOI did not resolve to the successor/);

    // Failing readback where predecessor is not SUPERSEDED must fail
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return { ...successorProposal, state: "ACTIVE" };
      if (id === "profile-000001") return { ...predecessorProfile, state: "ACTIVE" };
      throw new Error(`Profile ${id} not found`);
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000002");
    await expect(verifyCallback!({})).rejects.toThrow(/Predecessor profile was not superseded/);
  });
});

describe("independent approval validation failures", () => {
  beforeEach(() => {
    mockContractAddress = "0xD0bB9C0D436092d7bBB03F2458C60473739923EC";
    vi.spyOn(genlayer, "connectWallet").mockResolvedValue("0x1111111111111111111111111111111111111111");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function openApproveTab() {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /metamask/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /0x1111…1111/i })).toBeInTheDocument();
    });
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^register$/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve existing successor/i }));
  }

  it("shows error for non-DRAFT successor", async () => {
    vi.spyOn(genlayer, "readProfile").mockResolvedValue({
      ...successorProposal,
      state: "ACTIVE",
    });

    await openApproveTab();
    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/only DRAFT profiles can be approved/i);
    });

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^browse$/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows error for initial profile without predecessor", async () => {
    vi.spyOn(genlayer, "readProfile").mockResolvedValue({
      ...successorProposal,
      previous_profile_id: "",
    });

    await openApproveTab();
    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/initial draft with no predecessor/i);
    });
  });

  it("shows error when predecessor is not ACTIVE", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return { ...predecessorProfile, state: "SUPERSEDED" };
      throw new Error("Not found");
    });

    await openApproveTab();
    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/predecessor must be ACTIVE/i);
    });
  });

  it("shows error when canonical active pointer no longer equals predecessor", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return predecessorProfile;
      throw new Error("Not found");
    });
    vi.spyOn(genlayer, "readActiveProfile").mockResolvedValue("profile-000009");

    await openApproveTab();
    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/predecessor is no longer the active canonical version/i);
    });
  });

  it("shows error when predecessor canonical DOI does not match successor DOI", async () => {
    vi.spyOn(genlayer, "readProfile").mockImplementation(async (id) => {
      if (id === "profile-000002") return successorProposal;
      if (id === "profile-000001") return { ...predecessorProfile, canonical_work_doi: "10.9999/other-work" };
      throw new Error("Not found");
    });

    await openApproveTab();
    const input = screen.getByPlaceholderText("profile-000002");
    fireEvent.change(input, { target: { value: "profile-000002" } });
    fireEvent.click(screen.getByRole("button", { name: /load proposal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Predecessor canonical DOI does not match successor DOI/i);
    });
  });
});
