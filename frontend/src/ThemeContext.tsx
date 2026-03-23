import React, { createContext, useContext, useState, useMemo } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

type Mode = "light" | "dark";

interface ThemeContextValue {
  mode: Mode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  toggleTheme: () => {},
});

export const useThemeMode = () => useContext(ThemeContext);

function buildTheme(mode: Mode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: { main: "#dc004e" },
      secondary: { main: "#ff7aaa" },
      background: isDark
        ? { default: "#060e1d", paper: "#0d1e38" }
        : { default: "#f0f2f5", paper: "#ffffff" },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          // Remove MUI dark-mode white elevation overlay
          root: { backgroundImage: "none" },
        },
      },
      ...(isDark && {
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: "#0d1e38",
              borderRight: "1px solid rgba(255,255,255,0.08)",
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: {
              backgroundColor: "#0d1e38",
              border: "1px solid rgba(255,255,255,0.08)",
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: { backgroundColor: "#0d1e38" },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            root: { borderColor: "rgba(255,255,255,0.06)" },
          },
        },
        MuiDivider: {
          styleOverrides: {
            root: { borderColor: "rgba(255,255,255,0.08)" },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            notchedOutline: { borderColor: "rgba(255,255,255,0.15)" },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: { borderColor: "rgba(255,255,255,0.2)" },
          },
        },
      }),
    },
    typography: {
      fontFamily: "Roboto, Arial, sans-serif",
    },
  });
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem("themeMode") as Mode) || "dark"
  );

  const toggleTheme = () => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("themeMode", next);
      return next;
    });
  };

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
