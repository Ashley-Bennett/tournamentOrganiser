import React, { createContext, useContext, useState, useEffect } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        authSubscription = subscription;
        // Mirror access token into localStorage so existing API helper can keep sending it if needed.
        if (newSession?.access_token) {
          localStorage.setItem("token", newSession.access_token);
        } else {
          localStorage.removeItem("token");
        }
      });

      setLoading(false);
    };

    void initAuth();

    return () => {
      isMounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

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

  const register = async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });
    if (error) {
      throw new Error(error.message || "Registration failed");
    }
  };

  const logout = () => {
    void supabase.auth.signOut();
    localStorage.removeItem("token");
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
