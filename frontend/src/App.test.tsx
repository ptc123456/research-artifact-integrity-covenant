import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("unconfigured application", () => {
  it("fails closed and opens an explicit provider selector", () => {
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Contract not configured");
    expect(screen.getByRole("button", { name: /load profile/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("No provider is selected automatically");
  });
});
