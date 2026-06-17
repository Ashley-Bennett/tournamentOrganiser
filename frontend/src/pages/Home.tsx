import React, { useState, useEffect } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useAuth } from "../AuthContext";
import Tournaments from "./Tournaments";
import DeviceTournaments from "./DeviceTournaments";

function viewModeKey(userId: string) {
  return `matchamp_view_mode_${userId}`;
}

const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState(0);
  const [tabInitialised, setTabInitialised] = useState(false);

  useEffect(() => {
    if (tabInitialised) return;
    if (user) {
      const stored = localStorage.getItem(viewModeKey(user.id));
      if (stored === "player") { setTab(1); setTabInitialised(true); return; }
      if (stored === "organiser") { setTab(0); setTabInitialised(true); return; }
    }
    if (profile !== undefined) {
      setTab(profile?.onboarding_intent === "player" ? 1 : 0);
      setTabInitialised(true);
    }
  }, [user, profile, tabInitialised]);

  const handleTabChange = (_: React.SyntheticEvent, newTab: number) => {
    setTab(newTab);
    if (user) {
      localStorage.setItem(viewModeKey(user.id), newTab === 1 ? "player" : "organiser");
    }
  };

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        <Tab label="Organising" />
        <Tab label="Playing" />
      </Tabs>

      {tab === 0 && <Tournaments embedded />}
      {tab === 1 && <DeviceTournaments embedded />}
    </Box>
  );
};

export default Home;
