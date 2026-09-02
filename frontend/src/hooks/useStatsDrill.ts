import { createContext, useContext } from "react";
import type { DetailView } from "../utils/statsDrill";

export interface DrillApi {
  /** Opens a player or deck drill-down, pushing it onto the view stack. */
  open: (view: DetailView) => void;
}

export const DrillContext = createContext<DrillApi>({ open: () => {} });

/** Opens a drill-down from anywhere inside the stats page. */
export function useStatsDrill(): DrillApi {
  return useContext(DrillContext);
}
