import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

interface Profile {
  id: string;
  display_name: string | null;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the public.profiles row for the current user
  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
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
  }, [fetchProfile]);

  const login = async (email: string, password: string) => {
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
  };

  const register = async (
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
  };

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    localStorage.removeItem("token");
  }, []);

  const displayName =
    profile?.display_name || user?.email || "User";

  return (
    <AuthContext.Provider
      value={{ user, session, profile, displayName, loading, login, register, logout }}
    >
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
