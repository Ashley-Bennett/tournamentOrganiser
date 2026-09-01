import React, { useMemo, useState } from "react";
import { Box, Button, Skeleton, TableSortLabel, Tooltip, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadCsv, toCsv } from "../utils/csv";

/**
 * The shared table for the stats pages.
 *
 * Every stats table was the same hand-rolled `<table>` with the same inline
 * styles and no sorting. This owns the markup, the sort state and the "show
 * more" tail so a new table is a column list rather than another copy.
 *
 * Sorting is client-side and deliberately so: the RPCs already aggregate, so
 * what comes back is hundreds of rows at worst, and sorting them in the browser
 * keeps every column instantly sortable without a round trip per click.
 * Filtering stays with the caller — each section knows what its own rows mean.
 */

export interface StatsColumn<T> {
  key: string;
  label: string;
  /**
   * Value used to sort this column. Omit to make the column unsortable.
   * Nulls always sort last, in both directions — "no data" is not a low score.
   */
  sortValue?: (row: T) => number | string | null | undefined;
  render: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right";
  /**
   * Plain value for CSV export. Falls back to `sortValue`; a column with
   * neither exports blank, which is right for a purely decorative column.
   */
  csvValue?: (row: T) => string | number | null | undefined;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

const HEAD: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid rgba(128,128,128,0.3)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const CELL: React.CSSProperties = { padding: "10px 12px" };

export default function StatsTable<T>({
  rows,
  columns,
  getRowKey,
  initialSort,
  onRowClick,
  loading,
  emptyMessage,
  initialLimit,
  csvFilename,
}: {
  rows: T[];
  columns: StatsColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  /** Sort applied before the user touches a header. */
  initialSort?: SortState;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage: string;
  /** Show this many rows with a "show all" button. Omit to show everything. */
  initialLimit?: number;
  /** Basename for the CSV download. Omit to hide the export button. */
  csvFilename?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Copy first: sorting the prop array in place would mutate the caller's state.
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * factor;
      }
      return ((av as number) - (bv as number)) * factor;
    });
  }, [rows, columns, sort]);

  const limited =
    initialLimit != null && !expanded ? sorted.slice(0, initialLimit) : sorted;
  const hiddenCount = sorted.length - limited.length;

  function exportCsv() {
    const cols = columns.filter((c) => c.csvValue || c.sortValue);
    const csv = toCsv(
      cols.map((c) => c.label),
      sorted.map((row) => cols.map((c) => (c.csvValue ?? c.sortValue)!(row))),
    );
    downloadCsv(csvFilename!, csv);
  }

  function toggleSort(key: string) {
    setSort((cur) => {
      if (cur?.key !== key) {
        // Numbers are almost always most interesting largest-first; the caller
        // can override by clicking again.
        return { key, dir: "desc" };
      }
      return { key, dir: cur.dir === "desc" ? "asc" : "desc" };
    });
  }

  if (loading) {
    return <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1 }} />;
  }

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled">
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <>
      {csvFilename && (
        <Box display="flex" justifyContent="flex-end" mb={0.5}>
          <Tooltip title="Download what is shown, in the current sort order">
            <Button size="small" startIcon={<DownloadIcon />} onClick={exportCsv}>
              CSV
            </Button>
          </Tooltip>
        </Box>
      )}
      {/* maxWidth pins the wrapper to its container so a wide table scrolls
          here rather than stretching the page — the table is reusable, so it
          cannot rely on every host page constraining its own width. */}
      <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ ...HEAD, textAlign: c.align ?? "left" }}>
                  {c.sortValue ? (
                    <TableSortLabel
                      active={sort?.key === c.key}
                      direction={sort?.key === c.key ? sort.dir : "desc"}
                      onClick={() => toggleSort(c.key)}
                      sx={{ fontSize: 11, letterSpacing: 1, fontWeight: 600 }}
                    >
                      {c.label}
                    </TableSortLabel>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {limited.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  borderBottom: "1px solid rgba(128,128,128,0.15)",
                  cursor: onRowClick ? "pointer" : undefined,
                }}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ ...CELL, textAlign: c.align ?? "left" }}>
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {hiddenCount > 0 && (
        <Box mt={1}>
          <Button size="small" onClick={() => setExpanded(true)}>
            Show {hiddenCount} more
          </Button>
        </Box>
      )}
      {expanded && initialLimit != null && sorted.length > initialLimit && (
        <Box mt={1}>
          <Button size="small" onClick={() => setExpanded(false)}>
            Show fewer
          </Button>
        </Box>
      )}
    </>
  );
}
