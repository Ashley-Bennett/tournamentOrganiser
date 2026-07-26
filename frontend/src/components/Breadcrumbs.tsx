import React from "react";
import { Breadcrumbs as MuiBreadcrumbs, Link as MuiLink, Typography } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Link as RouterLink } from "react-router-dom";

export interface Crumb {
  label: string;
  /** Omit `to` for the current (non-link) page — usually the last crumb. */
  to?: string;
}

/**
 * A breadcrumb trail. The last crumb (or any crumb without `to`) renders as
 * plain text; the rest are router links. Gives a one-click route back to the
 * dashboard (and any intermediate level) from anywhere in the tournament flow.
 */
const Breadcrumbs: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <MuiBreadcrumbs
    separator={<NavigateNextIcon fontSize="small" />}
    aria-label="breadcrumb"
    sx={{ mb: 2, "& .MuiBreadcrumbs-li": { minWidth: 0 } }}
  >
    {items.map((c, i) => {
      const isLast = i === items.length - 1;
      if (isLast || !c.to) {
        return (
          <Typography
            key={i}
            variant="body2"
            color={isLast ? "text.primary" : "text.secondary"}
            fontWeight={isLast ? 600 : 400}
            noWrap
          >
            {c.label}
          </Typography>
        );
      }
      return (
        <MuiLink
          key={i}
          component={RouterLink}
          to={c.to}
          variant="body2"
          color="text.secondary"
          underline="hover"
          noWrap
        >
          {c.label}
        </MuiLink>
      );
    })}
  </MuiBreadcrumbs>
);

export default Breadcrumbs;
