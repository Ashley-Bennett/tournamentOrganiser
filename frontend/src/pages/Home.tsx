import React, { useState, useEffect } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useAuth } from "../AuthContext";
import Tournaments from "./Tournaments";
import DeviceTournaments from "./DeviceTournaments";

type View = "organiser" | "player";

function viewModeKey(userId: string) {
  return `matchamp_view_mode_${userId}`;
}

const TABS: Record<View, { label: string; view: View }[]> = {
  organiser: [
    { label: "Organising", view: "organiser" },
    { label: "Playing", view: "player" },
  ],
  player: [
    { label: "Playing", view: "player" },
    { label: "Organising", view: "organiser" },
  ],
};

const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const intent: View = profile?.onboarding_intent ?? "organiser";
  const tabs = TABS[intent];

  const [activeView, setActiveView] = useState<View>(intent);
  const [initialised, setInitialised] = useState(false);

  // On first load, use localStorage if present, otherwise default to intent
  useEffect(() => {
    if (initialised || profile === undefined) return;
    const stored = user ? localStorage.getItem(viewModeKey(user.id)) : null;
    setActiveView(stored === "player" || stored === "organiser" ? stored : intent);
    setInitialised(true);
  }, [user, profile, initialised, intent]);

  // When intent changes (e.g. toggled from account page), switch to that view
  useEffect(() => {
    if (!initialised) return;
    setActiveView(intent);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (_: React.SyntheticEvent, newIndex: number) => {
    const view = tabs[newIndex].view;
    setActiveView(view);
    if (user) localStorage.setItem(viewModeKey(user.id), view);
  };

  const tabIndex = tabs.findIndex((t) => t.view === activeView);
  const currentTabIndex = tabIndex === -1 ? 0 : tabIndex;

  return (
    <Box>
      <Tabs
        value={currentTabIndex}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {tabs.map((t) => (
          <Tab key={t.view} label={t.label} />
        ))}
      </Tabs>

      {activeView === "organiser" && <Tournaments embedded />}
      {activeView === "player" && <DeviceTournaments embedded />}
    </Box>
  );
};

export default Home;
