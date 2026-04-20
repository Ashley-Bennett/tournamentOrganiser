# Schema

### tournaments
- id: uuid (pk)
- name: text (required)
- created_by: uuid (required)
- status: text (required)
- tournament_type: text (required)
- num_rounds: integer

### tournament_players
- id: uuid (pk)
- tournament_id: uuid (required, fk)
- name: text (required)
- created_by: uuid (required)
- dropped: boolean (required)
- dropped_at_round: integer
- has_static_seating: boolean (required)
- static_seat_number: integer

### tournament_matches
- id: uuid (pk)
- tournament_id: uuid (required, fk)
- round_number: integer (required)
- player1_id: uuid (required, fk)
- player2_id: uuid (fk)
- winner_id: uuid (fk)
- result: text
- temp_winner_id: uuid (fk)
- temp_result: text
- match_number: integer
- status: text (required)
- pairing_decision_log: jsonb

### tournament_standings
- tournament_id: uuid (required, fk)
- player_id: uuid (required, fk)
- match_points: integer (required)
- wins: integer (required)
- losses: integer (required)
- draws: integer (required)
- matches_played: integer (required)
- byes_received: integer (required)

### workspaces
- id: uuid (pk)
- name: text (required)
- slug: text (required)
- type: text (required)
- created_by: uuid (fk)

### workspace_memberships
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- role: text (required)

### profiles
- id: uuid (pk)
- display_name: text
- default_workspace_id: uuid (fk)

### workspace_invites
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- email: text (required)
- role: text (required)
- invited_by: uuid (required)
- token: text (required)
- status: text (required)
- expires_at: timestamp(tz) (required)

### workspace_players
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- preferred_name: text

### tournament_player_claims
- id: uuid (pk)
- tournament_player_id: uuid (required, fk)
- workspace_id: uuid (required, fk)
- token: text (required)
- created_by: uuid (required)
- status: text (required)
- expires_at: timestamp(tz) (required)

### audit_log
- id: uuid (pk)
- table_name: text (required)
- record_id: uuid (fk)
- operation: text (required)
- user_id: uuid (fk)
- old_data: jsonb
- new_data: jsonb
- changed_at: timestamp(tz) (required)

### match_result_reports
- id: uuid (pk)
- match_id: uuid (required, fk)
- player_id: uuid (required, fk)
- reported_outcome: text (required)
- submitted_at: timestamp(tz) (required)
