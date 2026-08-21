import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
