import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  createBeachRankerApi,
  type Match,
  type MatchPayload,
  type MatchSet,
  type Player,
  type PlayerGender,
  type Ranking,
  type Role,
  type User
} from "@beach-ranker/api-client";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { languageOptions, translate, type Language, type TranslationKey } from "./i18n";

const tokenKey = "beachranker_session";
const languageKey = "beachranker_language";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
const ratingOptions = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
const emptySets: MatchSet[] = [
  { teamAPoints: 21, teamBPoints: 18 },
  { teamAPoints: 21, teamBPoints: 18 }
];

type EditableScore = number | "";
type ScoreField = "teamAPoints" | "teamBPoints";
type EditableMatchSet = {
  teamAPoints: EditableScore;
  teamBPoints: EditableScore;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  startupError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: ReturnType<typeof createBeachRankerApi>;
};

type DataState = {
  players: Player[];
  rankings: Ranking[];
  matches: Match[];
  loading: boolean;
  refresh: () => Promise<void>;
};

type LocaleState = {
  language: Language;
  dateLocale: string;
  t: (key: TranslationKey) => string;
  setLanguage: (language: Language) => Promise<void>;
};

type RankingsStackParamList = {
  RankingsHome: { gender: PlayerGender };
  PlayerProfile: { playerId: string };
};

type MatchesStackParamList = {
  MatchesHome: undefined;
  MatchEditor: { matchId?: string };
};

type AddStackParamList = {
  AddHome: undefined;
};

type ProfileStackParamList = {
  ProfileHome: undefined;
};

type AdminStackParamList = {
  AdminHome: undefined;
};

type RootTabParamList = {
  Rankings: undefined;
  Matches: undefined;
  Add: undefined;
  Profile: undefined;
  Admin: undefined;
};

const AuthContext = createContext<AuthState | null>(null);
const DataContext = createContext<DataState | null>(null);
const LocaleContext = createContext<LocaleState | null>(null);
const RankingsStack = createNativeStackNavigator<RankingsStackParamList>();
const MatchesStack = createNativeStackNavigator<MatchesStackParamList>();
const AddStack = createNativeStackNavigator<AddStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const AdminStack = createNativeStackNavigator<AdminStackParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  const auth = useAuth();
  const locale = useLocale();

  if (auth.loading) {
    return (
      <SafeAreaProvider>
        <LocaleContext.Provider value={locale}>
          <Centered label={locale.t("loadingApp")} />
        </LocaleContext.Provider>
      </SafeAreaProvider>
    );
  }

  if (!auth.user) {
    return (
      <SafeAreaProvider>
        <LocaleContext.Provider value={locale}>
          <LoginScreen auth={auth} />
        </LocaleContext.Provider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <LocaleContext.Provider value={locale}>
        <AuthContext.Provider value={auth}>
          <AppDataProvider>
            <NavigationContainer>
            <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green }}>
              <Tabs.Screen name="Rankings" component={RankingsNavigator} options={{ title: locale.t("rankings"), tabBarIcon: ({ color, size }) => <TabIcon name="rankings" color={color} size={size} /> }} />
              <Tabs.Screen name="Matches" component={MatchesNavigator} options={{ title: locale.t("matches"), tabBarIcon: ({ color, size }) => <TabIcon name="matches" color={color} size={size} /> }} />
              <Tabs.Screen name="Add" component={AddNavigator} options={{ title: locale.t("add"), tabBarIcon: ({ color, size }) => <TabIcon name="add" color={color} size={size} /> }} />
              <Tabs.Screen name="Profile" component={ProfileNavigator} options={{ title: locale.t("profile"), tabBarIcon: ({ color, size }) => <TabIcon name="profile" color={color} size={size} /> }} />
              {auth.user.role === "ADMIN" && (
                <Tabs.Screen name="Admin" component={AdminNavigator} options={{ title: locale.t("admin"), tabBarIcon: ({ color, size }) => <TabIcon name="admin" color={color} size={size} /> }} />
              )}
            </Tabs.Navigator>
            </NavigationContainer>
          </AppDataProvider>
        </AuthContext.Provider>
      </LocaleContext.Provider>
    </SafeAreaProvider>
  );
}

function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Auth context is not available");
  }
  return value;
}

function useDataContext() {
  const value = useContext(DataContext);
  if (!value) {
    throw new Error("Data context is not available");
  }
  return value;
}

function useLocaleContext() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("Locale context is not available");
  }
  return value;
}

function TabIcon({ name, color, size }: { name: "rankings" | "matches" | "add" | "profile" | "admin"; color: string; size: number }) {
  if (name === "rankings") {
    return (
      <View style={[styles.tabIcon, { width: size, height: size }]}>
        <View style={styles.podium}>
          <View style={[styles.podiumBar, styles.podiumSecond, { backgroundColor: color }]} />
          <View style={[styles.podiumBar, styles.podiumFirst, { backgroundColor: color }]} />
          <View style={[styles.podiumBar, styles.podiumThird, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === "matches") {
    return (
      <View style={[styles.tabIcon, { width: size, height: size }]}>
        <View style={[styles.matchIconCard, { borderColor: color }]}>
          <View style={[styles.matchIconLine, { backgroundColor: color }]} />
          <View style={[styles.matchIconLineShort, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === "add") {
    return (
      <View style={[styles.tabIcon, { width: size, height: size }]}>
        <View style={[styles.addIconRing, { borderColor: color }]}>
          <View style={[styles.addIconHorizontal, { backgroundColor: color }]} />
          <View style={[styles.addIconVertical, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === "profile") {
    return (
      <View style={[styles.tabIcon, { width: size, height: size }]}>
        <View style={[styles.profileIconHead, { borderColor: color }]} />
        <View style={[styles.profileIconBody, { borderColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.tabIcon, { width: size, height: size }]}>
      <View style={[styles.adminIconHead, { borderColor: color }]} />
      <View style={[styles.adminIconBody, { borderColor: color }]} />
    </View>
  );
}

function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const api = useMemo(
    () =>
      createBeachRankerApi({
        baseUrl: apiBaseUrl,
        authMode: "bearer",
        getToken: () => SecureStore.getItemAsync(tokenKey),
        setToken: async (token) => {
          if (token) {
            await SecureStore.setItemAsync(tokenKey, token);
          } else {
            await SecureStore.deleteItemAsync(tokenKey);
          }
        }
      }),
    []
  );

  useEffect(() => {
    api
      .me()
      .then((result) => setUser(result.user))
      .catch((error: Error) => {
        setUser(null);
        setStartupError(error.message);
      })
      .finally(() => setLoading(false));
  }, [api]);

  return {
    user,
    loading,
    startupError,
    api,
    login: async (email, password) => {
      const result = await api.login(email, password);
      setStartupError(null);
      setUser(result.user);
    },
    logout: async () => {
      try {
        await api.logout();
      } finally {
        setUser(null);
      }
    }
  };
}

function useLocale(): LocaleState {
  const [language, setLanguageState] = useState<Language>("no");
  const selectedOption = languageOptions.find((option) => option.value === language) ?? languageOptions[0];

  useEffect(() => {
    SecureStore.getItemAsync(languageKey)
      .then((saved) => {
        if (saved === "no" || saved === "en") {
          setLanguageState(saved);
        }
      })
      .catch(() => {
        // The app can still switch language for this session if persistence fails.
      });
  }, []);

  const setLanguage = useCallback(async (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    await SecureStore.setItemAsync(languageKey, nextLanguage);
  }, []);

  return useMemo(
    () => ({
      language,
      dateLocale: selectedOption.dateLocale,
      t: (key: TranslationKey) => translate(language, key),
      setLanguage
    }),
    [language, selectedOption.dateLocale, setLanguage]
  );
}

function AppDataProvider({ children }: { children: ReactNode }) {
  const { api } = useAuthContext();
  const { t } = useLocaleContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const errors: string[] = [];

    try {
      const playersResult = await api.players();
      setPlayers(playersResult.players);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : t("requestFailed"));
    }

    try {
      const rankingsResult = await api.rankings();
      setRankings(rankingsResult.rankings);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : t("requestFailed"));
    }

    try {
      const matchesResult = await api.matches();
      setMatches(matchesResult.matches);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : t("requestFailed"));
    }

    setLoading(false);
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }
  }, [api, t]);

  useEffect(() => {
    refresh().catch((error: Error) => {
      setLoading(false);
      Alert.alert(t("requestFailed"), error.message);
    });
  }, [refresh]);

  return <DataContext.Provider value={{ players, rankings, matches, loading, refresh }}>{children}</DataContext.Provider>;
}

function LoginScreen({ auth }: { auth: AuthState }) {
  const { t } = useLocaleContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await auth.login(email, password);
    } catch (error) {
      Alert.alert(t("loginFailed"), error instanceof Error ? error.message : t("couldNotSignIn"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.login}>
      <Text style={styles.brand}>BeachRanker</Text>
      <Text style={styles.subtitle}>{t("tagline")}</Text>
      <LanguageDropdown compact />
      <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder={t("email")} value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder={t("password")} secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton label={busy ? t("signingIn") : t("signIn")} disabled={busy || !email || !password} onPress={submit} />
      {auth.startupError && <Text style={styles.help}>{t("startupCheckFailed")} {auth.startupError}</Text>}
      {!apiBaseUrl && <Text style={styles.help}>{t("apiHint")}</Text>}
      {apiBaseUrl && <Text style={styles.help}>API: {apiBaseUrl}</Text>}
    </View>
  );
}

function RankingsNavigator() {
  const { t } = useLocaleContext();
  return (
    <RankingsStack.Navigator>
      <RankingsStack.Screen name="RankingsHome" component={RankingsScreen} initialParams={{ gender: "MEN" }} options={{ title: t("rankings") }} />
      <RankingsStack.Screen name="PlayerProfile" component={PlayerProfileScreen} options={{ title: t("player") }} />
    </RankingsStack.Navigator>
  );
}

function RankingsScreen({ route, navigation }: NativeStackScreenProps<RankingsStackParamList, "RankingsHome">) {
  const { rankings, loading } = useDataContext();
  const { t } = useLocaleContext();
  const gender = route.params.gender;
  const visibleRankings = rankings.filter((player) => player.gender === gender);

  if (loading) {
    return <Centered label={t("loadingRankings")} />;
  }

  return (
    <Screen scroll={false}>
      <Segmented
        value={gender}
        options={[
          { label: t("men"), value: "MEN" },
          { label: t("women"), value: "WOMEN" }
        ]}
        onChange={(next) => navigation.setParams({ gender: next })}
      />
      <FlatList
        style={styles.list}
        data={visibleRankings}
        keyExtractor={(player) => player.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate("PlayerProfile", { playerId: item.id })}>
            <Text style={styles.rank}>#{item.rank}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.wins}-{item.losses} · {item.matchesPlayed} {t("played")}</Text>
            </View>
            <Text style={styles.rating}>{item.rating}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState label={t("noRankedPlayers")} />}
      />
    </Screen>
  );
}

function PlayerProfileScreen({ route }: NativeStackScreenProps<RankingsStackParamList, "PlayerProfile">) {
  const { api } = useAuthContext();
  const { rankings } = useDataContext();
  const { t } = useLocaleContext();
  const player = rankings.find((candidate) => candidate.id === route.params.playerId);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .matches(route.params.playerId)
      .then((result) => setMatches(result.matches))
      .catch((error: Error) => Alert.alert(t("loadingMatches"), error.message))
      .finally(() => setLoading(false));
  }, [api, route.params.playerId, t]);

  if (!player) {
    return <EmptyState label={t("playerNotFound")} />;
  }

  return (
    <Screen scroll={false}>
      <ScreenHeader title={player.name} subtitle={`#${player.rank} · ${player.rating} Elo · ${player.wins}-${player.losses}`} />
      {loading ? <Centered label={t("loadingMatches")} /> : <MatchList matches={matches} />}
    </Screen>
  );
}

function MatchesNavigator() {
  const { t } = useLocaleContext();
  return (
    <MatchesStack.Navigator>
      <MatchesStack.Screen name="MatchesHome" component={MatchesScreen} options={{ title: t("matches") }} />
      <MatchesStack.Screen name="MatchEditor" component={MatchEditorScreen} options={{ title: t("correctMatch") }} />
    </MatchesStack.Navigator>
  );
}

function MatchesScreen({ navigation }: NativeStackScreenProps<MatchesStackParamList, "MatchesHome">) {
  const { user, api } = useAuthContext();
  const { matches, refresh } = useDataContext();

  return (
    <Screen scroll={false}>
      <MatchList
        matches={matches}
        canEdit={user?.role === "ADMIN"}
        onEdit={(match) => navigation.navigate("MatchEditor", { matchId: match.id })}
        onDelete={async (match) => {
          await api.deleteMatch(match.id);
          await refresh();
        }}
      />
    </Screen>
  );
}

function AddMatchScreen() {
  return <MatchForm />;
}

function AddNavigator() {
  const { t } = useLocaleContext();
  return (
    <AddStack.Navigator>
      <AddStack.Screen name="AddHome" component={AddMatchScreen} options={{ title: t("addMatch") }} />
    </AddStack.Navigator>
  );
}

function MatchEditorScreen({ route }: NativeStackScreenProps<MatchesStackParamList, "MatchEditor">) {
  const { matches } = useDataContext();
  return <MatchForm editingMatch={matches.find((match) => match.id === route.params.matchId)} />;
}

function parseEditableScore(value: string): EditableScore {
  if (value === "") {
    return "";
  }

  const score = Number(value);
  return Number.isFinite(score) ? score : "";
}

function normalizeSets(sets: EditableMatchSet[]): MatchSet[] {
  return sets.map((set) => ({
    teamAPoints: set.teamAPoints === "" ? 0 : set.teamAPoints,
    teamBPoints: set.teamBPoints === "" ? 0 : set.teamBPoints
  }));
}

function MatchForm({ editingMatch }: { editingMatch?: Match }) {
  const { api } = useAuthContext();
  const { players, refresh } = useDataContext();
  const { t } = useLocaleContext();
  const navigation = useNavigation();
  const [playedAt, setPlayedAt] = useState(() => dateFromPlayedAt(editingMatch?.playedAt));
  const [teamAPlayerIds, setTeamAPlayerIds] = useState(() => editingMatch?.teamA.map((player) => player.id) ?? ["", ""]);
  const [teamBPlayerIds, setTeamBPlayerIds] = useState(() => editingMatch?.teamB.map((player) => player.id) ?? ["", ""]);
  const [sets, setSets] = useState<EditableMatchSet[]>(() => editingMatch?.sets ?? emptySets);
  const [busy, setBusy] = useState(false);
  const activePlayers = players.filter((player) => player.active);
  const numericSets = useMemo(() => normalizeSets(sets), [sets]);

  function setPlayer(team: "A" | "B", index: number, playerId: string) {
    const setter = team === "A" ? setTeamAPlayerIds : setTeamBPlayerIds;
    setter((current) => current.map((value, currentIndex) => (currentIndex === index ? playerId : value)));
  }

  function setSet(index: number, key: ScoreField, value: string) {
    setSets((current) => current.map((set, currentIndex) => (currentIndex === index ? { ...set, [key]: parseEditableScore(value) } : set)));
  }

  function commitSet(index: number, key: ScoreField) {
    setSets((current) =>
      current.map((set, currentIndex) => (currentIndex === index && set[key] === "" ? { ...set, [key]: 0 } : set))
    );
  }

  async function submit() {
    const selected = [...teamAPlayerIds, ...teamBPlayerIds];
    if (selected.some((id) => !id) || new Set(selected).size !== 4) {
      Alert.alert(t("selectFourUnique"));
      return;
    }
    const payload: MatchPayload = {
      playedAt: toMatchPlayedAtIso(playedAt),
      teamAPlayerIds,
      teamBPlayerIds,
      sets: numericSets,
      isTiebreak: sets.length >= 3
    };
    setBusy(true);
    try {
      if (editingMatch) {
        await api.updateMatch(editingMatch.id, payload);
      } else {
        await api.createMatch(payload);
      }
      await refresh();
      if (!editingMatch) {
        setTeamAPlayerIds(["", ""]);
        setTeamBPlayerIds(["", ""]);
        setSets(emptySets);
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert(t("couldNotSaveMatch"), error instanceof Error ? error.message : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen compactTop>
      <DateField label={t("playedOn")} value={playedAt} onChange={setPlayedAt} />
      {teamAPlayerIds.map((value, index) => (
        <PlayerPicker key={`a-${index}`} label={`${t("teamA")} ${t("player").toLowerCase()} ${index + 1}`} players={activePlayers} value={value} onChange={(id) => setPlayer("A", index, id)} />
      ))}
      {teamBPlayerIds.map((value, index) => (
        <PlayerPicker key={`b-${index}`} label={`${t("teamB")} ${t("player").toLowerCase()} ${index + 1}`} players={activePlayers} value={value} onChange={(id) => setPlayer("B", index, id)} />
      ))}
      {sets.map((set, index) => (
        <View key={index} style={styles.setRow}>
          <Text style={styles.label}>{t("set")} {index + 1}</Text>
          <TextInput style={styles.scoreInput} keyboardType="number-pad" value={String(set.teamAPoints)} onBlur={() => commitSet(index, "teamAPoints")} onChangeText={(value) => setSet(index, "teamAPoints", value)} />
          <TextInput style={styles.scoreInput} keyboardType="number-pad" value={String(set.teamBPoints)} onBlur={() => commitSet(index, "teamBPoints")} onChangeText={(value) => setSet(index, "teamBPoints", value)} />
        </View>
      ))}
      {sets.length < 3 && <SecondaryButton label={t("addSet")} onPress={() => setSets((current) => [...current, { teamAPoints: 15, teamBPoints: 12 }])} />}
      {sets.length > 1 && <SecondaryButton label={t("removeSet")} onPress={() => setSets((current) => current.slice(0, -1))} />}
      <PrimaryButton label={busy ? t("saving") : editingMatch ? t("saveCorrection") : t("saveMatch")} disabled={busy} onPress={submit} />
    </Screen>
  );
}

function AdminNavigator() {
  const { t } = useLocaleContext();
  return (
    <AdminStack.Navigator>
      <AdminStack.Screen name="AdminHome" component={AdminScreen} options={{ title: t("admin") }} />
    </AdminStack.Navigator>
  );
}

function ProfileScreen() {
  const { user, logout } = useAuthContext();
  const { t } = useLocaleContext();

  return (
    <Screen scroll={false} compactTop>
      <View style={styles.profileCard}>
        <Text style={styles.profileName}>{user?.displayName}</Text>
        <Text style={styles.profileMeta}>{user?.email}</Text>
        <Text style={styles.profileMeta}>{user?.role}</Text>
      </View>
      <LanguageDropdown />
      <PrimaryButton label={t("logOut")} onPress={() => logout().catch((error: Error) => Alert.alert(t("couldNotLogOut"), error.message))} />
    </Screen>
  );
}

function ProfileNavigator() {
  const { t } = useLocaleContext();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: t("profile") }} />
    </ProfileStack.Navigator>
  );
}

function AdminScreen() {
  const { api } = useAuthContext();
  const { players, refresh } = useDataContext();
  const { t } = useLocaleContext();
  const [playerName, setPlayerName] = useState("");
  const [gender, setGender] = useState<PlayerGender>("MEN");
  const [rating, setRating] = useState(1500);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("PLAYER");
  const [linkedPlayerId, setLinkedPlayerId] = useState("");

  async function createPlayer() {
    await api.createPlayer(playerName, rating, gender);
    setPlayerName("");
    await refresh();
  }

  async function createUser() {
    await api.createUser({
      email,
      displayName,
      password,
      role,
      playerId: linkedPlayerId || undefined
    });
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("PLAYER");
    setLinkedPlayerId("");
  }

  return (
    <Screen>
      <ScreenHeader title={t("admin")} subtitle={t("addPlayersAndUsers")} />
      <Text style={styles.sectionTitle}>{t("addPlayer")}</Text>
      <TextInput style={styles.input} placeholder={t("playerName")} value={playerName} onChangeText={setPlayerName} />
      <SelectField
        label={t("gender")}
        value={gender}
        options={[
          { label: t("men"), value: "MEN" },
          { label: t("women"), value: "WOMEN" }
        ]}
        onChange={setGender}
      />
      <SelectField
        label={t("initialRating")}
        value={rating}
        options={ratingOptions.map((option) => ({ label: `${option} Elo`, value: option }))}
        onChange={setRating}
      />
      <PrimaryButton label={t("addPlayer")} disabled={!playerName} onPress={() => createPlayer().catch((error: Error) => Alert.alert(t("couldNotAddPlayer"), error.message))} />

      <Text style={styles.sectionTitle}>{t("createUser")}</Text>
      <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder={t("email")} value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder={t("displayName")} value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder={t("temporaryPassword")} secureTextEntry value={password} onChangeText={setPassword} />
      <SelectField
        label={t("role")}
        value={role}
        options={[
          { label: t("playerRole"), value: "PLAYER" },
          { label: t("adminRole"), value: "ADMIN" }
        ]}
        onChange={setRole}
      />
      <PlayerPicker label={t("linkedPlayer")} players={players} value={linkedPlayerId} onChange={setLinkedPlayerId} optional />
      <PrimaryButton label={t("createUser")} disabled={!email || !displayName || password.length < 8} onPress={() => createUser().catch((error: Error) => Alert.alert(t("couldNotCreateUser"), error.message))} />
    </Screen>
  );
}

function MatchList({
  matches,
  canEdit = false,
  onEdit,
  onDelete
}: {
  matches: Match[];
  canEdit?: boolean;
  onEdit?: (match: Match) => void;
  onDelete?: (match: Match) => Promise<void>;
}) {
  const { t, dateLocale } = useLocaleContext();
  if (matches.length === 0) {
    return <EmptyState label={t("noMatchesFound")} />;
  }

  return (
    <FlatList
      style={styles.list}
      data={matches}
      keyExtractor={(match) => match.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.rowMeta}>{new Date(item.playedAt).toLocaleDateString(dateLocale)} {item.rated ? "" : `· ${t("unrated")}`}</Text>
          <Text style={styles.rowTitle}>{t("teamA")}: {item.teamA.map((player) => player.name).join(" / ")}</Text>
          <Text style={styles.rowTitle}>{t("teamB")}: {item.teamB.map((player) => player.name).join(" / ")}</Text>
          <Text style={styles.rowMeta}>{formatScore(item.sets)} · {t("enteredBy")} {item.enteredBy.displayName}</Text>
          {canEdit && (
            <View style={styles.actions}>
              <SecondaryButton label={t("edit")} onPress={() => onEdit?.(item)} />
              <SecondaryButton label={t("delete")} onPress={() => onDelete?.(item).catch((error: Error) => Alert.alert(t("couldNotDeleteMatch"), error.message))} />
            </View>
          )}
        </View>
      )}
    />
  );
}

function PlayerPicker({
  label,
  players,
  value,
  onChange,
  optional = false
}: {
  label: string;
  players: Player[];
  value: string;
  onChange: (playerId: string) => void;
  optional?: boolean;
}) {
  const { t } = useLocaleContext();
  const options = [
    optional ? { label: t("noLinkedPlayer"), value: "" } : { label: t("selectPlayer"), value: "" },
    ...players.map((player) => ({ label: player.name, value: player.id }))
  ];

  return (
    <SelectField
      label={label}
      value={value}
      options={options}
      placeholder={optional ? t("noLinkedPlayer") : t("selectPlayer")}
      onChange={onChange}
    />
  );
}

function LanguageDropdown({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLocaleContext();
  const options = languageOptions.map((option) => ({
    label: compact ? option.shortLabel : option.label,
    value: option.value
  }));

  return (
    <SelectField
      label={t("language")}
      value={language}
      options={options}
      onChange={(nextLanguage) => {
        setLanguage(nextLanguage).catch(() => undefined);
      }}
    />
  );
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  placeholder,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  placeholder?: string;
  onChange: (value: T) => void;
}) {
  const { t } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const fallbackLabel = placeholder ?? t("select");
  const displayLabel = String(selected?.value ?? "") === "" ? fallbackLabel : selected?.label ?? fallbackLabel;

  function select(next: T) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Field label={label}>
      <Pressable style={styles.selectButton} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]}>{displayLabel}</Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.selectModal}>
            <View style={styles.selectModalHeader}>
              <Text style={styles.selectModalTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.logoutText}>{t("close")}</Text>
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(option) => String(option.value)}
              renderItem={({ item }) => (
                <Pressable style={[styles.selectOption, item.value === value && styles.selectOptionActive]} onPress={() => select(item.value)}>
                  <Text style={[styles.selectOptionText, item.value === value && styles.selectOptionTextActive]}>{item.label}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
}) {
  const { dateLocale, t } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(value));
  const days = buildMonthDays(monthCursor);

  function selectDate(next: Date) {
    onChange(next);
    setMonthCursor(startOfMonth(next));
    setOpen(false);
  }

  return (
    <Field label={label}>
      <Pressable style={styles.selectButton} onPress={() => setOpen(true)}>
        <Text style={styles.selectText}>{formatDisplayDate(value, dateLocale)}</Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dateModal}>
            <View style={styles.selectModalHeader}>
              <Text style={styles.selectModalTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.logoutText}>{t("close")}</Text>
              </Pressable>
            </View>
            <View style={styles.monthHeader}>
              <Pressable style={styles.monthNavButton} onPress={() => setMonthCursor((current) => addMonths(current, -1))}>
                <Text style={styles.monthNavText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.monthTitle}>{formatMonthYear(monthCursor, dateLocale)}</Text>
              <Pressable style={styles.monthNavButton} onPress={() => setMonthCursor((current) => addMonths(current, 1))}>
                <Text style={styles.monthNavText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.weekdayRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
                <Text key={`${weekday}-${index}`} style={styles.weekdayText}>
                  {weekday}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {days.map((day, index) =>
                day ? (
                  <Pressable
                    key={day.toISOString()}
                    style={[styles.calendarDay, sameDay(day, value) && styles.calendarDaySelected]}
                    onPress={() => selectDate(day)}
                  >
                    <Text style={[styles.calendarDayText, sameDay(day, value) && styles.calendarDayTextSelected]}>{day.getDate()}</Text>
                  </Pressable>
                ) : (
                  <View key={`empty-${index}`} style={styles.calendarDay} />
                )
              )}
            </View>
            <PrimaryButton label={t("today")} onPress={() => selectDate(new Date())} />
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenHeaderTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenHeaderSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function buildMonthDays(month: Date) {
  const firstDay = month.getDay();
  const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let index = 0; index < firstDay; index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return cells;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function formatDisplayDate(value: Date, locale: string) {
  return value.toLocaleDateString(locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatMonthYear(value: Date, locale: string) {
  return value.toLocaleDateString(locale, {
    month: "long",
    year: "numeric"
  });
}

function dateFromPlayedAt(value?: string) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toMatchPlayedAtIso(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0).toISOString();
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable key={option.value} style={[styles.segment, value === option.value && styles.segmentActive]} onPress={() => onChange(option.value)}>
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Screen({
  children,
  scroll = true,
  compactTop = false
}: {
  children: ReactNode;
  scroll?: boolean;
  compactTop?: boolean;
}) {
  const contentStyle = compactTop ? styles.screenCompact : styles.screen;
  const containerStyle = compactTop ? styles.screenContainerCompact : styles.screenContainer;

  if (!scroll) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safeScreen}>
        <View style={containerStyle}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safeScreen}>
      <ScrollView style={styles.scrollScreen} contentContainerStyle={contentStyle}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}

function formatScore(sets: MatchSet[]) {
  return sets.map((set) => `${set.teamAPoints}-${set.teamBPoints}`).join(", ");
}

const colors = {
  green: "#19705f",
  ink: "#17211d",
  muted: "#65726b",
  line: "#d9e1d7",
  bg: "#f3f7f2",
  card: "#ffffff"
};

const styles = StyleSheet.create({
  login: {
    flex: 1,
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: colors.bg
  },
  safeScreen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  scrollScreen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  screen: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.bg
  },
  screenCompact: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.bg
  },
  screenContainer: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.bg
  },
  screenContainerCompact: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.bg
  },
  screenHeader: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.card
  },
  screenHeaderTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  screenHeaderSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  list: {
    flex: 1
  },
  tabIcon: {
    alignItems: "center",
    justifyContent: "center"
  },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 20
  },
  podiumBar: {
    width: 5,
    borderRadius: 2
  },
  podiumFirst: {
    height: 20
  },
  podiumSecond: {
    height: 14,
    opacity: 0.75
  },
  podiumThird: {
    height: 10,
    opacity: 0.55
  },
  matchIconCard: {
    width: 21,
    height: 17,
    justifyContent: "center",
    gap: 4,
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 4
  },
  matchIconLine: {
    width: 10,
    height: 2,
    borderRadius: 1
  },
  matchIconLineShort: {
    width: 7,
    height: 2,
    borderRadius: 1
  },
  addIconRing: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 11
  },
  addIconHorizontal: {
    position: "absolute",
    width: 11,
    height: 2,
    borderRadius: 1
  },
  addIconVertical: {
    position: "absolute",
    width: 2,
    height: 11,
    borderRadius: 1
  },
  adminIconHead: {
    width: 8,
    height: 8,
    borderWidth: 2,
    borderRadius: 4
  },
  adminIconBody: {
    width: 18,
    height: 9,
    marginTop: 2,
    borderWidth: 2,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomWidth: 0
  },
  profileIconHead: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderRadius: 4.5
  },
  profileIconBody: {
    width: 18,
    height: 8,
    marginTop: 2,
    borderWidth: 2,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomWidth: 0
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.bg
  },
  brand: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15
  },
  help: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.card
  },
  field: {
    gap: 6
  },
  selectButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card
  },
  selectText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700"
  },
  selectPlaceholder: {
    color: colors.muted
  },
  selectChevron: {
    marginLeft: 8,
    color: colors.green,
    fontSize: 13,
    fontWeight: "900"
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.28)"
  },
  selectModal: {
    maxHeight: "72%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    backgroundColor: colors.bg
  },
  dateModal: {
    maxHeight: "78%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    backgroundColor: colors.bg
  },
  selectModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  monthNavButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.card
  },
  monthNavText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: "900"
  },
  monthTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  weekdayText: {
    width: 36,
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800"
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12
  },
  calendarDay: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderRadius: 8
  },
  calendarDaySelected: {
    backgroundColor: colors.green
  },
  calendarDayText: {
    color: colors.ink,
    fontWeight: "700"
  },
  calendarDayTextSelected: {
    color: "#ffffff",
    fontWeight: "900"
  },
  selectModalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  selectOption: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card
  },
  selectOptionActive: {
    borderColor: colors.green,
    backgroundColor: "#e8efe5"
  },
  selectOptionText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700"
  },
  selectOptionTextActive: {
    color: colors.green,
    fontWeight: "900"
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.green
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card
  },
  secondaryButtonText: {
    color: colors.green,
    fontWeight: "800"
  },
  disabled: {
    opacity: 0.5
  },
  segmented: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 10,
    backgroundColor: "#e8efe5"
  },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 10
  },
  segmentActive: {
    backgroundColor: colors.green
  },
  segmentText: {
    color: colors.muted,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: "#ffffff"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.card
  },
  rank: {
    width: 42,
    color: colors.green,
    fontWeight: "900"
  },
  rowMain: {
    flex: 1
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13
  },
  rating: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  card: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginBottom: 12,
    padding: 14,
    backgroundColor: colors.card
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  scoreInput: {
    width: 72,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.card
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160
  },
  accountBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.card
  },
  accountName: {
    color: colors.ink,
    fontWeight: "800"
  },
  profileCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.card
  },
  profileName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  profileMeta: {
    color: colors.muted,
    fontSize: 14
  },
  logoutText: {
    color: colors.green,
    fontWeight: "800"
  }
});
