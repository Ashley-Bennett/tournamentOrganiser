import React from "react";
import ReactDOM from "react-dom";
import type { MatchWithPlayers } from "../types/match";
import type { PlayerWithTieBreakers } from "../utils/tieBreaking";

const PRINT_STYLES = `
@media print {
  body > *:not(.print-portal) {
    display: none !important;
  }
  .print-portal {
    display: block !important;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    padding: 20px;
  }
  .print-header {
    text-align: center;
    margin-bottom: 20px;
    border-bottom: 2px solid #000;
    padding-bottom: 12px;
  }
  .print-header h1 {
    font-size: 22pt;
    margin: 0 0 4px;
  }
  .print-header p {
    font-size: 12pt;
    margin: 0;
    color: #444;
  }
  .print-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .print-table th {
    font-weight: bold;
    text-align: left;
    border-bottom: 2px solid #000;
    padding: 5px 8px;
  }
  .print-table td {
    padding: 4px 8px;
    border-bottom: 1px solid #ccc;
  }
  .print-table .col-num {
    width: 52px;
    color: #555;
  }
  .print-table .col-vs {
    width: 28px;
    text-align: center;
    color: #999;
  }
  .print-table .col-right {
    text-align: right;
  }
  .print-table .col-rank {
    width: 52px;
  }
  .print-table .col-record {
    width: 80px;
    text-align: right;
  }
  .print-table .col-pts {
    width: 48px;
    text-align: right;
  }
  .print-table .col-pct {
    width: 72px;
    text-align: right;
  }
  .print-table tr.dropped {
    opacity: 0.55;
  }
  .print-footer {
    margin-top: 16px;
    font-size: 8pt;
    color: #999;
    text-align: center;
  }
}
`;

interface PairingsProps {
  mode: "pairings";
  tournamentName: string;
  roundLabel: string;
  matches: MatchWithPlayers[];
}

interface StandingsProps {
  mode: "standings";
  tournamentName: string;
  standings: PlayerWithTieBreakers[];
  droppedMap: Map<string, number | null>;
}

type Props = PairingsProps | StandingsProps;

const PrintContent: React.FC<Props> = (props) => (
  <div className="print-portal" style={{ display: "none" }}>
    <style>{PRINT_STYLES}</style>

    <div className="print-header">
      <h1>{props.tournamentName}</h1>
      <p>{props.mode === "pairings" ? props.roundLabel : "Final Standings"}</p>
    </div>

    {props.mode === "pairings" ? (
      <table className="print-table">
        <thead>
          <tr>
            <th className="col-num">Table</th>
            <th>Player 1</th>
            <th className="col-vs" />
            <th>Player 2</th>
          </tr>
        </thead>
        <tbody>
          {props.matches.map((m) => (
            <tr key={m.id}>
              <td className="col-num">{m.match_number ?? "—"}</td>
              <td>{m.player1_name}</td>
              <td className="col-vs">vs</td>
              <td>{m.player2_id ? m.player2_name : <em>BYE</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <table className="print-table">
        <thead>
          <tr>
            <th className="col-rank">Rank</th>
            <th>Player</th>
            <th className="col-record">Record</th>
            <th className="col-pts">Pts</th>
            <th className="col-pct">OMW%</th>
            <th className="col-pct">OOMW%</th>
          </tr>
        </thead>
        <tbody>
          {props.standings.map((player, idx) => {
            const rank = idx + 1;
            const isDropped = props.droppedMap.has(player.id);
            const droppedRound = props.droppedMap.get(player.id);
            return (
              <tr key={player.id} className={isDropped ? "dropped" : undefined}>
                <td className="col-rank">{rank}</td>
                <td>
                  {player.name}
                  {isDropped && (
                    <span style={{ color: "#999", fontSize: "0.85em" }}>
                      {droppedRound != null ? ` (dropped R${droppedRound})` : " (dropped)"}
                    </span>
                  )}
                </td>
                <td className="col-record">
                  {player.wins}-{player.losses}-{player.draws}
                </td>
                <td className="col-pts">{player.matchPoints}</td>
                <td className="col-pct">
                  {(player.opponentMatchWinPercentage * 100).toFixed(1)}%
                </td>
                <td className="col-pct">
                  {(player.opponentOpponentMatchWinPercentage * 100).toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}

    <div className="print-footer">
      Printed {new Date().toLocaleString()}
    </div>
  </div>
);

const PrintView: React.FC<Props> = (props) =>
  ReactDOM.createPortal(<PrintContent {...props} />, document.body);

export default PrintView;
