import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    me: vi.fn(),
    players: vi.fn(),
    rankings: vi.fn(),
    matches: vi.fn(),
    createMatch: vi.fn(),
    updateMatch: vi.fn(),
    deleteMatch: vi.fn(),
    logout: vi.fn()
  }
}));

const players = [
  { id: "alice", name: "Alice Anders", active: true, initialRating: 1500 },
  { id: "bob", name: "Bob Berg", active: true, initialRating: 1500 },
  { id: "cara", name: "Cara Coast", active: true, initialRating: 1500 },
  { id: "dan", name: "Dan Dune", active: true, initialRating: 1500 }
];

function choosePlayer(label: string, playerName: string) {
  const select = screen.getByRole("combobox", { name: label });
  fireEvent.focus(select);
  const listbox = screen.getByRole("listbox", { name: `${label} options` });
  fireEvent.mouseDown(within(listbox).getByRole("option", { name: playerName }));
}

describe("match player selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
        clear: vi.fn(() => storage.clear())
      }
    });
    window.localStorage.setItem("beachranker-language", "en");
    vi.mocked(api.me).mockResolvedValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        displayName: "Admin",
        role: "ADMIN",
        active: true
      }
    });
    vi.mocked(api.players).mockResolvedValue({ players });
    vi.mocked(api.rankings).mockResolvedValue({ rankings: [] });
    vi.mocked(api.matches).mockResolvedValue({ matches: [] });
  });

  it("searches player select options and blocks already selected players across teams", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /add match/i }));

    const teamAPlayer1 = screen.getByRole("combobox", { name: "Team A player 1" });
    fireEvent.focus(teamAPlayer1);
    fireEvent.change(teamAPlayer1, { target: { value: "ali" } });
    expect(screen.getByRole("option", { name: "Alice Anders" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bob Berg" })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("option", { name: "Alice Anders" }));
    expect(teamAPlayer1).toHaveValue("Alice Anders");

    const teamBPlayer1 = screen.getByRole("combobox", { name: "Team B player 1" });
    fireEvent.focus(teamBPlayer1);
    const teamBListbox = screen.getByRole("listbox", { name: "Team B player 1 options" });
    expect(within(teamBListbox).getByRole("option", { name: "Alice Anders Already selected" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    fireEvent.mouseDown(within(teamBListbox).getByRole("option", { name: "Alice Anders Already selected" }));
    expect(teamBPlayer1).toHaveValue("");
  });

  it("selects player options with the keyboard", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /add match/i }));

    const teamAPlayer1 = screen.getByRole("combobox", { name: "Team A player 1" });
    fireEvent.focus(teamAPlayer1);
    fireEvent.change(teamAPlayer1, { target: { value: "bob" } });
    fireEvent.keyDown(teamAPlayer1, { key: "ArrowDown" });
    fireEvent.keyDown(teamAPlayer1, { key: "Enter" });

    expect(teamAPlayer1).toHaveValue("Bob Berg");
  });

  it("marks a match as tiebreak only when a third set is added", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /add match/i }));
    expect(screen.queryByRole("checkbox", { name: /tiebreak match/i })).not.toBeInTheDocument();

    choosePlayer("Team A player 1", "Alice Anders");
    choosePlayer("Team A player 2", "Bob Berg");
    choosePlayer("Team B player 1", "Cara Coast");
    choosePlayer("Team B player 2", "Dan Dune");

    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
    fireEvent.click(screen.getByRole("button", { name: "Save match" }));

    await waitFor(() => expect(api.createMatch).toHaveBeenCalled());
    expect(vi.mocked(api.createMatch).mock.calls[0][0]).toMatchObject({
      isTiebreak: true,
      sets: [
        { teamAPoints: 21, teamBPoints: 18 },
        { teamAPoints: 21, teamBPoints: 18 },
        { teamAPoints: 15, teamBPoints: 13 }
      ]
    });
  });
});
