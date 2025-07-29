import React, { createContext, useContext, useState, useEffect } from "react";
import { apiCall } from "./utils/api";

interface AuthContextType {
  user: { name: string; email: string } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token")
  );
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );

  useEffect(() => {
    if (token) {
      // Decode JWT to get user info (simple base64 decode, not verifying signature)
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({ name: payload.name, email: payload.email });
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await apiCall("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("token", data.token);
    setToken(data.token);
  };

  const register = async (name: string, email: string, password: string) => {
    console.log("🚀 Starting registration process...");
    console.log("📤 Sending request to /api/users");

    const requestBody = { name, email, password };
    console.log("📝 Request body:", { name, email, hasPassword: !!password });

    const res = await apiCall("/api/users", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    console.log("📥 Response status:", res.status);
    console.log(
      "📥 Response headers:",
      Object.fromEntries(res.headers.entries())
    );

    const responseText = await res.text();
    console.log("📥 Raw response text:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
      console.log("📥 Parsed response data:", data);
    } catch (parseError) {
      console.error("❌ Failed to parse JSON response:", parseError);
      console.log("📥 Raw response was:", responseText);
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    if (!res.ok) {
      console.error("❌ Registration failed:", data);
      throw new Error(data.error || "Registration failed");
    }

    console.log("✅ Registration successful:", data);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
