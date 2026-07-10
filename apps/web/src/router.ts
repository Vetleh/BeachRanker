import { useEffect, useMemo, useState } from "react";

export type RankingGender = "MEN" | "WOMEN";
export type Tab = "rankings" | "matches" | "add" | "profile" | "admin";

export type AppRoute =
  | { name: "rankings"; path: "/rankings/men" | "/rankings/women"; gender: RankingGender }
  | { name: "matches"; path: "/matches" }
  | { name: "newMatch"; path: "/matches/new" }
  | { name: "editMatch"; path: string; matchId: string }
  | { name: "player"; path: string; playerId: string }
  | { name: "admin"; path: "/admin" }
  | { name: "notFound"; path: string };

export function useBrowserRoute(): [AppRoute, (path: string, options?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    function handlePopState() {
      setRoute(parseRoute(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useMemo(
    () =>
      (path: string, options: { replace?: boolean } = {}) => {
        const nextPath = normalizePath(path);
        if (nextPath === window.location.pathname) {
          setRoute(parseRoute(nextPath));
          return;
        }

        if (options.replace) {
          window.history.replaceState(null, "", nextPath);
        } else {
          window.history.pushState(null, "", nextPath);
        }
        setRoute(parseRoute(nextPath));
      },
    [],
  );

  return [route, navigate];
}

export function parseRoute(pathname: string): AppRoute {
  const path = normalizePath(pathname);
  if (path === "/" || path === "/rankings") {
    return { name: "rankings", path: "/rankings/men", gender: "MEN" };
  }
  if (path === "/rankings/men") {
    return { name: "rankings", path: "/rankings/men", gender: "MEN" };
  }
  if (path === "/rankings/women") {
    return { name: "rankings", path: "/rankings/women", gender: "WOMEN" };
  }
  if (path === "/matches") {
    return { name: "matches", path: "/matches" };
  }
  if (path === "/matches/new") {
    return { name: "newMatch", path: "/matches/new" };
  }
  if (path === "/admin") {
    return { name: "admin", path: "/admin" };
  }

  const editMatch = path.match(/^\/matches\/([^/]+)\/edit$/);
  if (editMatch?.[1]) {
    return { name: "editMatch", path, matchId: decodeURIComponent(editMatch[1]) };
  }

  const player = path.match(/^\/players\/([^/]+)$/);
  if (player?.[1]) {
    return { name: "player", path, playerId: decodeURIComponent(player[1]) };
  }

  return { name: "notFound", path };
}

export function getActiveTab(route: AppRoute): Tab {
  if (route.name === "matches") {
    return "matches";
  }
  if (route.name === "newMatch" || route.name === "editMatch") {
    return "add";
  }
  if (route.name === "admin") {
    return "admin";
  }
  if (route.name === "player") {
    return "profile";
  }
  return "rankings";
}

function normalizePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}
