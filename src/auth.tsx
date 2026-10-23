import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Me, SessionUser } from "./types";

type AuthValue = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    setMe(await api<Me>("/api/login", { method: "POST", body: JSON.stringify({ email, password }) }));
  }

  async function signOut() {
    await api("/api/logout", { method: "POST" });
    setMe(null);
  }

  return <AuthContext.Provider value={{ me, loading, refresh, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

export function fullName(user: Pick<SessionUser, "firstName" | "lastName">) {
  return `${user.firstName} ${user.lastName}`;
}
