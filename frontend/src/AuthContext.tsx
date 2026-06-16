import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import SupabaseErrorScreen, {
  type SupabaseErrorType,
} from "./components/SupabaseErrorScreen";

export interface Profile {
  id: string;
  display_name: string | null;
  onboarding_intent: "organiser" | "player" | null;
  default_workspace_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  displayName: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ session: Session | null }>;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<Profile, "display_name" | "onboarding_intent" | "default_workspace_id">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface SupabaseError {
  type: SupabaseErrorType;
  detail?: string;
}

async function probeSupabase(): Promise<SupabaseError | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: supabaseAnonKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 503 || res.status === 402) {
      return { type: "paused" };
    }
    if (!res.ok && res.status !== 200 && res.status !== 400 && res.status !== 401) {
      return { type: "error", detail: `HTTP ${res.status}` };
    }
    return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { type: "network", detail: "Request timed out" };
    }
    if (err instanceof TypeError) {
      return { type: "network", detail: err.message };
    }
    return { type: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState<SupabaseError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Fetch the public.profiles row for the current user
  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, onboarding_intent, default_workspace_id")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let authSubscription:
      | ReturnType<
          typeof supabase.auth.onAuthStateChange
        >["data"]["subscription"]
      | null = null;

    const initAuth = async () => {
      setLoading(true);
      setSupabaseError(null);

      const probe = await probeSupabase();
      if (!isMounted) return;
      if (probe) {
        setSupabaseError(probe);
        setLoading(false);
        return;
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          void fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        // Mirror access token into localStorage so existing API helper can keep sending it if needed.
        if (newSession?.access_token) {
          localStorage.setItem("token", newSession.access_token);
        } else {
          localStorage.removeItem("token");
        }
      });

      // Assign subscription immediately after the call, not inside the callback
      authSubscription = subscription;

      if (!isMounted) return;
      setLoading(false);
    };

    void initAuth();

    return () => {
      isMounted = false;
      authSubscription?.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProfile, retryKey]);

  // Refresh session when the tab becomes visible again — browser timer throttling
  // can prevent the Supabase client's built-in proactive refresh from firing on time,
  // causing expired tokens and silent RLS failures on private resources.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void supabase.auth.refreshSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message || "Login failed");
    }
    // Session change handler will update state + localStorage token
    if (data.session?.access_token) {
      localStorage.setItem("token", data.session.access_token);
    }
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
  ): Promise<{ session: Session | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });
    if (error) {
      throw new Error(error.message || "Registration failed");
    }
    return { session: data.session };
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    localStorage.removeItem("token");
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, "display_name" | "onboarding_intent" | "default_workspace_id">>) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select("id, display_name, onboarding_intent, default_workspace_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) setProfile(data);
    },
    [user],
  );

  const displayName =
    profile?.display_name || user?.email || "User";

  const handleRetry = useCallback(() => setRetryKey((k) => k + 1), []);

  const contextValue = useMemo(
    () => ({ user, session, profile, displayName, loading, login, register, logout, updateProfile }),
    [user, session, profile, displayName, loading, login, register, logout, updateProfile],
  );

  if (!loading && supabaseError) {
    return (
      <SupabaseErrorScreen
        type={supabaseError.type}
        detail={supabaseError.detail}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is a hook, not a component
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
