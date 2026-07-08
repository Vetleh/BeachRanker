import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  History,
  LogOut,
  Shield,
  Trophy,
  UserRound,
  Users,
  Volleyball
} from "lucide-react";
import { api, type MatchPayload } from "./api";
import { translate, type Language, type TranslationPath } from "./i18n";
import { getActiveTab, useBrowserRoute, type Tab } from "./router";
import { deriveWinner, formatScore } from "./score";
import type { Match, MatchSet, Player, Ranking, Role, User } from "./types";

const emptySets: MatchSet[] = [
  { teamAPoints: 21, teamBPoints: 18 },
  { teamAPoints: 21, teamBPoints: 18 }
];

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = getStoredLanguage();
    return saved === "en" || saved === "no" ? saved : "no";
  });
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileMatches, setProfileMatches] = useState<Match[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [route, navigate] = useBrowserRoute();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = (path: TranslationPath, values?: Record<string, string | number>) => translate(language, path, values);
  const activeTab = getActiveTab(route);
  const profilePlayerId = route.name === "player" ? route.playerId : "";
  const selectedProfile = profilePlayerId ? rankings.find((player) => player.id === profilePlayerId) ?? null : null;
  const editingMatch = route.name === "editMatch" ? matches.find((match) => match.id === route.matchId) ?? null : null;

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    storeLanguage(nextLanguage);
  }

  useEffect(() => {
    api
      .me()
      .then(({ user }) => {
        setUser(user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refreshData() {
    const [playersResult, rankingsResult, matchesResult] = await Promise.all([
      api.players(),
      api.rankings(),
      api.matches()
    ]);

    setPlayers(playersResult.players);
    setRankings(rankingsResult.rankings);
    setMatches(matchesResult.matches);
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    refreshData().catch((err: Error) => setError(err.message));
  }, [user]);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setPlayers([]);
    setRankings([]);
    setMatches([]);
    setProfileMatches([]);
    navigate("/rankings", { replace: true });
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    if (route.name === "notFound") {
      navigate("/rankings", { replace: true });
      return;
    }

    if (route.name === "admin" && user.role !== "ADMIN") {
      navigate("/rankings", { replace: true });
    }
  }, [navigate, route.name, user]);

  useEffect(() => {
    if (route.name !== "player" || !user || !selectedProfile) {
      return;
    }

    let isCurrent = true;
    setProfileMatches([]);
    setProfileLoading(true);

    api
      .matches(profilePlayerId)
      .then((result) => {
        if (isCurrent) {
          setProfileMatches(result.matches);
        }
      })
      .catch((err: Error) => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : t("errors.loadProfile"));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setProfileLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [route.name, profilePlayerId, selectedProfile?.id, user]);

  if (loading) {
    return <div className="centered">{t("app.loading")}</div>;
  }

  if (!user) {
    return <LoginScreen language={language} onLanguageChange={changeLanguage} t={t} onLogin={setUser} />;
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Trophy; adminOnly?: boolean }> = [
    { id: "rankings", label: t("tabs.rankings"), icon: Trophy },
    { id: "matches", label: t("tabs.matches"), icon: History },
    { id: "add", label: editingMatch ? t("tabs.correctMatch") : t("tabs.addMatch"), icon: CalendarPlus },
    { id: "admin", label: t("tabs.admin"), icon: Shield, adminOnly: true }
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Volleyball size={24} />
          </div>
          <div>
            <h1>BeachRanker</h1>
            <p>{t("app.tagline")}</p>
          </div>
        </div>
        <div className="session">
          <LanguageSelect language={language} onChange={changeLanguage} t={t} />
          <span>{user.displayName}</span>
          <button className="icon-button" type="button" onClick={handleLogout} aria-label={t("auth.logout")}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t("tabs.rankings")}>
        {tabs
          .filter((tab) => !tab.adminOnly || user.role === "ADMIN")
          .map((tab) => {
            const Icon = tab.icon;
            const path = tab.id === "add" ? "/matches/new" : `/${tab.id}`;

            return (
              <button
                className={activeTab === tab.id ? "tab active" : "tab"}
                key={tab.id}
                type="button"
                onClick={() => navigate(path)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
      </nav>

      {error && (
        <button className="alert" type="button" onClick={() => setError("")}>
          {error}
        </button>
      )}

      <main>
        {route.name === "rankings" && (
          <RankingsView rankings={rankings} onViewPlayer={(player) => navigate(`/players/${player.id}`)} t={t} />
        )}
        {route.name === "matches" && (
          <MatchesView
            matches={matches}
            title={t("matches.myTitle")}
            subtitle={t("matches.mySubtitle", { count: matches.length })}
            canEdit={user.role === "ADMIN"}
            t={t}
            onEdit={(match) => navigate(`/matches/${match.id}/edit`)}
            onDelete={async (matchId) => {
              await api.deleteMatch(matchId);
              await refreshData();
            }}
          />
        )}
        {route.name === "player" &&
          (selectedProfile ? (
            <PlayerProfileView
              player={selectedProfile}
              matches={profileMatches}
              loading={profileLoading}
              t={t}
              onBack={() => navigate("/rankings")}
            />
          ) : (
            <section className="surface">
              <p className="empty-state">{rankings.length === 0 ? t("matches.loading") : t("errors.loadProfile")}</p>
            </section>
          ))}
        {(route.name === "newMatch" || route.name === "editMatch") && (
          route.name === "editMatch" && !editingMatch ? (
            <section className="surface">
              <p className="empty-state">{matches.length === 0 ? t("matches.loading") : t("errors.loadProfile")}</p>
            </section>
          ) : (
            <MatchForm
              players={players}
              editingMatch={editingMatch}
              t={t}
              onCancelEdit={() => navigate("/matches")}
              onSaved={async () => {
                await refreshData();
                navigate("/matches");
              }}
            />
          )
        )}
        {route.name === "admin" && user.role === "ADMIN" && <AdminView players={players} t={t} onChanged={refreshData} />}
      </main>
    </div>
  );
}

function getStoredLanguage() {
  try {
    return window.localStorage?.getItem("beachranker-language");
  } catch {
    return null;
  }
}

function storeLanguage(language: Language) {
  try {
    window.localStorage?.setItem("beachranker-language", language);
  } catch {
    // Language still changes for the current session when storage is unavailable.
  }
}

function LanguageSelect({
  language,
  onChange,
  t
}: {
  language: Language;
  onChange: (language: Language) => void;
  t: Translator;
}) {
  return (
    <label className="language-select">
      <span>{t("app.language")}</span>
      <select value={language} onChange={(event) => onChange(event.target.value as Language)}>
        <option value="no">{t("app.norwegian")}</option>
        <option value="en">{t("app.english")}</option>
      </select>
    </label>
  );
}

type Translator = (path: TranslationPath, values?: Record<string, string | number>) => string;

function LoginScreen({
  language,
  onLanguageChange,
  t,
  onLogin
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  onLogin: (user: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const result = await api.login(email, password);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-mark large">
          <Volleyball size={36} />
        </div>
        <LanguageSelect language={language} onChange={onLanguageChange} t={t} />
        <h1>BeachRanker</h1>
        <form onSubmit={submit} className="form-stack">
          <label>
            {t("auth.email")}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            {t("auth.password")}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit">
            {t("auth.signIn")}
          </button>
        </form>
      </section>
    </main>
  );
}

function RankingsView({
  rankings,
  onViewPlayer,
  t
}: {
  rankings: Ranking[];
  onViewPlayer: (player: Ranking) => void;
  t: Translator;
}) {
  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>{t("rankings.title")}</h2>
          <p>{t("rankings.subtitle", { count: rankings.length })}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("rankings.rank")}</th>
              <th>{t("rankings.player")}</th>
              <th>{t("rankings.elo")}</th>
              <th>{t("rankings.record")}</th>
              <th>{t("rankings.played")}</th>
              <th>{t("rankings.last")}</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((player) => (
              <tr key={player.id}>
                <td className="rank-cell">#{player.rank}</td>
                <td>
                  <button className="link-button" type="button" onClick={() => onViewPlayer(player)}>
                    {player.name}
                  </button>
                </td>
                <td className="rating-cell">{player.rating}</td>
                <td>
                  {player.wins}-{player.losses}
                </td>
                <td>{player.matchesPlayed}</td>
                <td className={player.recentDelta >= 0 ? "positive" : "negative"}>
                  {player.recentDelta > 0 ? "+" : ""}
                  {player.recentDelta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatchesView({
  matches,
  title,
  subtitle,
  canEdit,
  t,
  onEdit,
  onDelete
}: {
  matches: Match[];
  title?: string;
  subtitle?: string;
  canEdit: boolean;
  t: Translator;
  onEdit: (match: Match) => void;
  onDelete: (matchId: string) => Promise<void>;
}) {
  const [busyMatchId, setBusyMatchId] = useState("");

  return (
    <section className="match-list">
      <div className="section-heading">
        <div>
          <h2>{title ?? t("matches.historyTitle")}</h2>
          <p>{subtitle ?? t("matches.historySubtitle", { count: matches.length })}</p>
        </div>
      </div>
      {matches.length === 0 && <p className="empty-state">{t("matches.empty")}</p>}
      {matches.map((match) => (
        <article className="match-card" key={match.id}>
          <div className="match-meta">
            <span>{new Date(match.playedAt).toLocaleDateString()}</span>
            {match.isTiebreak && <span className="badge">{t("matches.tiebreak")}</span>}
          </div>
          <div className="teams">
            <TeamLine label={t("matches.teamA")} players={match.teamA} winner={match.winningTeam === "A"} />
            <TeamLine label={t("matches.teamB")} players={match.teamB} winner={match.winningTeam === "B"} />
          </div>
          <div className="match-footer">
            <span>{formatScore(match.sets)}</span>
            <span>{t("matches.enteredBy", { name: match.enteredBy.displayName })}</span>
            {canEdit && (
              <div className="inline-actions">
                <button type="button" onClick={() => onEdit(match)}>
                  {t("matches.edit")}
                </button>
                <button
                  type="button"
                  disabled={busyMatchId === match.id}
                  onClick={async () => {
                    setBusyMatchId(match.id);
                    await onDelete(match.id);
                    setBusyMatchId("");
                  }}
                >
                  {t("matches.delete")}
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function PlayerProfileView({
  player,
  matches,
  loading,
  t,
  onBack
}: {
  player: Ranking;
  matches: Match[];
  loading: boolean;
  t: Translator;
  onBack: () => void;
}) {
  return (
    <section className="profile-layout">
      <div className="surface profile-header">
        <button className="icon-text-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t("profile.backToRankings")}
        </button>
        <div className="profile-title">
          <div className="brand-mark">
            <UserRound size={22} />
          </div>
          <div>
            <h2>{player.name}</h2>
            <p>
              {t("profile.summary", {
                rank: player.rank,
                rating: player.rating,
                wins: player.wins,
                losses: player.losses
              })}
            </p>
          </div>
        </div>
      </div>
      {loading ? (
        <section className="surface">
          <p className="empty-state">{t("matches.loading")}</p>
        </section>
      ) : (
        <MatchesView
          matches={matches}
          title={t("matches.playerMatchesTitle", { name: player.name })}
          subtitle={t("matches.playerMatchesSubtitle", { count: matches.length })}
          canEdit={false}
          t={t}
          onEdit={() => undefined}
          onDelete={async () => undefined}
        />
      )}
    </section>
  );
}

function TeamLine({
  label,
  players,
  winner
}: {
  label: string;
  players: Match["teamA"];
  winner: boolean;
}) {
  const delta = players[0]?.delta ?? 0;

  return (
    <div className={winner ? "team-line winner" : "team-line"}>
      <span>{label}</span>
      <strong>{players.map((player) => player.name).join(" / ")}</strong>
      <span className={delta >= 0 ? "positive" : "negative"}>
        {delta > 0 ? "+" : ""}
        {delta}
      </span>
    </div>
  );
}

function MatchForm({
  players,
  editingMatch,
  t,
  onCancelEdit,
  onSaved
}: {
  players: Player[];
  editingMatch: Match | null;
  t: Translator;
  onCancelEdit: () => void;
  onSaved: () => Promise<void>;
}) {
  const activePlayers = useMemo(() => players.filter((player) => player.active), [players]);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [teamAPlayerIds, setTeamAPlayerIds] = useState<string[]>(["", ""]);
  const [teamBPlayerIds, setTeamBPlayerIds] = useState<string[]>(["", ""]);
  const [sets, setSets] = useState<MatchSet[]>(emptySets);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editingMatch) {
      return;
    }

    setPlayedAt(editingMatch.playedAt.slice(0, 10));
    setTeamAPlayerIds(editingMatch.teamA.map((player) => player.id));
    setTeamBPlayerIds(editingMatch.teamB.map((player) => player.id));
    setSets(editingMatch.sets.map((set) => ({ teamAPoints: set.teamAPoints, teamBPoints: set.teamBPoints })));
  }, [editingMatch]);

  const winner = deriveWinner(sets);
  const isTiebreak = sets.length >= 3;
  const selectedPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds];

  function setPlayer(team: "A" | "B", index: number, playerId: string) {
    if (playerId && selectedPlayerIds.includes(playerId)) {
      return;
    }

    const setter = team === "A" ? setTeamAPlayerIds : setTeamBPlayerIds;
    setter((current) => current.map((value, currentIndex) => (currentIndex === index ? playerId : value)));
  }

  function updateSet(index: number, key: keyof MatchSet, value: number) {
    setSets((current) =>
      current.map((set, currentIndex) => (currentIndex === index ? { ...set, [key]: value } : set))
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const selectedPlayers = [...teamAPlayerIds, ...teamBPlayerIds];
    if (new Set(selectedPlayers).size !== 4 || selectedPlayers.some((playerId) => !playerId)) {
      setError(t("matchForm.selectFourUnique"));
      return;
    }

    if (!winner) {
      setError(t("matchForm.scoresNeedWinner"));
      return;
    }

    const payload: MatchPayload = {
      playedAt: new Date(`${playedAt}T12:00:00`).toISOString(),
      teamAPlayerIds,
      teamBPlayerIds,
      sets,
      isTiebreak
    };

    try {
      if (editingMatch) {
        await api.updateMatch(editingMatch.id, payload);
      } else {
        await api.createMatch(payload);
      }
      await onSaved();
      if (!editingMatch) {
        setTeamAPlayerIds(["", ""]);
        setTeamBPlayerIds(["", ""]);
        setSets(emptySets);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("matchForm.saveFailed"));
    }
  }

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>{editingMatch ? t("matchForm.correctTitle") : t("matchForm.addTitle")}</h2>
          <p>{winner ? t("matchForm.winner", { team: winner }) : t("matchForm.instructions")}</p>
        </div>
        {editingMatch && (
          <button type="button" onClick={onCancelEdit}>
            {t("matchForm.cancelEdit")}
          </button>
        )}
      </div>
      <form className="match-form" onSubmit={submit}>
        <label>
          {t("matchForm.playedOn")}
          <input value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} type="date" />
        </label>
        <div className="team-grid">
          <fieldset>
            <legend>{t("matchForm.teamA")}</legend>
            {[0, 1].map((index) => (
              <PlayerSearchSelect
                key={index}
                label={t("matchForm.teamAPlayer", { number: index + 1 })}
                players={activePlayers}
                selectedPlayerIds={selectedPlayerIds}
                t={t}
                value={teamAPlayerIds[index]}
                onChange={(playerId) => setPlayer("A", index, playerId)}
              />
            ))}
          </fieldset>
          <fieldset>
            <legend>{t("matchForm.teamB")}</legend>
            {[0, 1].map((index) => (
              <PlayerSearchSelect
                key={index}
                label={t("matchForm.teamBPlayer", { number: index + 1 })}
                players={activePlayers}
                selectedPlayerIds={selectedPlayerIds}
                t={t}
                value={teamBPlayerIds[index]}
                onChange={(playerId) => setPlayer("B", index, playerId)}
              />
            ))}
          </fieldset>
        </div>
        <div className="score-grid">
          {sets.map((set, index) => (
            <div className="score-row" key={index}>
              <span>{t("matchForm.set", { number: index + 1 })}</span>
              <input
                type="number"
                min="0"
                value={set.teamAPoints}
                onChange={(event) => updateSet(index, "teamAPoints", Number(event.target.value))}
                aria-label={t("matchForm.teamAPoints", { number: index + 1 })}
              />
              <input
                type="number"
                min="0"
                value={set.teamBPoints}
                onChange={(event) => updateSet(index, "teamBPoints", Number(event.target.value))}
                aria-label={t("matchForm.teamBPoints", { number: index + 1 })}
              />
            </div>
          ))}
          <div className="inline-actions">
            <button
              type="button"
              onClick={() => setSets((current) => [...current, { teamAPoints: 15, teamBPoints: 13 }])}
              disabled={sets.length >= 3}
            >
              {t("matchForm.addSet")}
            </button>
            <button
              type="button"
              onClick={() => setSets((current) => current.slice(0, -1))}
              disabled={sets.length <= 1}
            >
              {t("matchForm.removeSet")}
            </button>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">
          {editingMatch ? t("matchForm.saveCorrection") : t("matchForm.saveMatch")}
        </button>
      </form>
    </section>
  );
}

function PlayerSearchSelect({
  label,
  players,
  selectedPlayerIds,
  t,
  value,
  onChange
}: {
  label: string;
  players: Player[];
  selectedPlayerIds: string[];
  t: Translator;
  value: string;
  onChange: (playerId: string) => void;
}) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedPlayer = players.find((player) => player.id === value);
  const blockedPlayerIds = useMemo(
    () => new Set(selectedPlayerIds.filter((playerId) => playerId && playerId !== value)),
    [selectedPlayerIds, value]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visiblePlayers = players.filter((player) => player.name.toLowerCase().includes(normalizedSearch));

  function selectPlayer(playerId: string) {
    if (blockedPlayerIds.has(playerId)) {
      return;
    }

    onChange(playerId);
    setSearch("");
    setIsOpen(false);
  }

  return (
    <div className="player-select">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        placeholder={t("playerSelect.search")}
        value={isOpen ? search : selectedPlayer?.name ?? ""}
        onFocus={() => {
          setSearch("");
          setIsOpen(true);
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setSearch("");
            setIsOpen(false);
          }, 100);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setSearch("");
            setIsOpen(false);
          }
        }}
      />
      {isOpen && (
        <div className="player-options" role="listbox" id={listboxId} aria-label={t("playerSelect.options", { label })}>
          {value && (
            <button
              className="player-option muted"
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange("");
                setSearch("");
                setIsOpen(false);
              }}
            >
              {t("playerSelect.clear")}
            </button>
          )}
          {visiblePlayers.map((player) => {
            const isBlocked = blockedPlayerIds.has(player.id);
            return (
              <button
                className={isBlocked ? "player-option disabled" : "player-option"}
                key={player.id}
                type="button"
                role="option"
                aria-disabled={isBlocked}
                aria-selected={player.id === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectPlayer(player.id);
                }}
              >
                <span>{player.name}</span>
                {isBlocked && <span className="option-note">{t("playerSelect.alreadySelected")}</span>}
              </button>
            );
          })}
          {visiblePlayers.length === 0 && <div className="empty-option">{t("playerSelect.empty")}</div>}
        </div>
      )}
    </div>
  );
}

function AdminView({ players, t, onChanged }: { players: Player[]; t: Translator; onChanged: () => Promise<void> }) {
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("PLAYER");
  const [playerId, setPlayerId] = useState("");
  const [message, setMessage] = useState("");

  async function createPlayer(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    await api.createPlayer(playerName);
    setPlayerName("");
    setMessage(t("admin.playerAdded"));
    await onChanged();
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    await api.createUser({
      email,
      displayName,
      password,
      role,
      playerId: playerId || undefined
    });
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("PLAYER");
    setPlayerId("");
    setMessage(t("admin.userCreated"));
    await onChanged();
  }

  return (
    <section className="admin-grid">
      <form className="surface form-stack" onSubmit={createPlayer}>
        <div className="section-heading compact">
          <div>
            <h2>{t("admin.addPlayerTitle")}</h2>
            <p>{t("admin.addPlayerDescription")}</p>
          </div>
        </div>
        <label>
          {t("admin.playerName")}
          <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} required />
        </label>
        <button className="primary-button" type="submit">
          <Users size={18} />
          {t("admin.addPlayerButton")}
        </button>
      </form>

      <form className="surface form-stack" onSubmit={createUser}>
        <div className="section-heading compact">
          <div>
            <h2>{t("admin.createUserTitle")}</h2>
            <p>{t("admin.createUserDescription")}</p>
          </div>
        </div>
        <label>
          {t("auth.email")}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          {t("admin.displayName")}
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <label>
          {t("admin.temporaryPassword")}
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={8}
            required
          />
        </label>
        <label>
          {t("admin.role")}
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="PLAYER">{t("admin.playerRole")}</option>
            <option value="ADMIN">{t("admin.adminRole")}</option>
          </select>
        </label>
        <label>
          {t("admin.linkedPlayer")}
          <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
            <option value="">{t("admin.noLinkedPlayer")}</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        {message && <p className="form-success">{message}</p>}
        <button className="primary-button" type="submit">
          <Shield size={18} />
          {t("admin.createUserButton")}
        </button>
      </form>
    </section>
  );
}
