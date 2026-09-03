export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          actor_label: string | null
          changed_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          actor_label?: string | null
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          actor_label?: string | null
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      match_insights: {
        Row: {
          id: string
          match_id: string
          opponent_deck_pokemon1: number | null
          opponent_deck_pokemon2: number | null
          player_id: string
          submitted_at: string
          went_first: boolean | null
        }
        Insert: {
          id?: string
          match_id: string
          opponent_deck_pokemon1?: number | null
          opponent_deck_pokemon2?: number | null
          player_id: string
          submitted_at?: string
          went_first?: boolean | null
        }
        Update: {
          id?: string
          match_id?: string
          opponent_deck_pokemon1?: number | null
          opponent_deck_pokemon2?: number | null
          player_id?: string
          submitted_at?: string
          went_first?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "match_insights_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result_reports: {
        Row: {
          id: string
          match_id: string
          player_id: string
          reported_outcome: string
          submitted_at: string
        }
        Insert: {
          id?: string
          match_id: string
          player_id: string
          reported_outcome: string
          submitted_at?: string
        }
        Update: {
          id?: string
          match_id?: string
          player_id?: string
          reported_outcome?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_result_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_badge: {
        Row: {
          badge_count: number
          badge_id: string
          earned_at: Json
          game_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          badge_count?: number
          badge_id: string
          earned_at?: Json
          game_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          badge_count?: number
          badge_id?: string
          earned_at?: Json
          game_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_badge_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      player_card: {
        Row: {
          game_id: string
          partner_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          game_id: string
          partner_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          game_id?: string
          partner_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_card_slot: {
        Row: {
          badge_id: string
          game_id: string
          slot: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          badge_id: string
          game_id: string
          slot: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          badge_id?: string
          game_id?: string
          slot?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_card_slot_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_workspace_id: string | null
          display_name: string | null
          id: string
          onboarding_intent: string | null
        }
        Insert: {
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          id: string
          onboarding_intent?: string | null
        }
        Update: {
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          id?: string
          onboarding_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscription_targets: {
        Row: {
          created_at: string
          id: string
          is_organiser: boolean
          subscription_id: string
          tournament_id: string
          tournament_player_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_organiser?: boolean
          subscription_id: string
          tournament_id: string
          tournament_player_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_organiser?: boolean
          subscription_id?: string
          tournament_id?: string
          tournament_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_targets_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscription_targets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscription_targets_tournament_player_id_fkey"
            columns: ["tournament_player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          confirmed_by: string | null
          created_at: string
          id: string
          match_number: number | null
          pairing_decision_log: Json | null
          pairings_published: boolean
          player1_id: string
          player2_id: string | null
          result: string | null
          result_recorded_at: string | null
          round_number: number
          status: string
          temp_result: string | null
          temp_winner_id: string | null
          tournament_id: string
          updated_at: string
          winner_id: string | null
          workspace_id: string
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          match_number?: number | null
          pairing_decision_log?: Json | null
          pairings_published?: boolean
          player1_id: string
          player2_id?: string | null
          result?: string | null
          result_recorded_at?: string | null
          round_number: number
          status?: string
          temp_result?: string | null
          temp_winner_id?: string | null
          tournament_id: string
          updated_at?: string
          winner_id?: string | null
          workspace_id: string
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          id?: string
          match_number?: number | null
          pairing_decision_log?: Json | null
          pairings_published?: boolean
          player1_id?: string
          player2_id?: string | null
          result?: string | null
          result_recorded_at?: string | null
          round_number?: number
          status?: string
          temp_result?: string | null
          temp_winner_id?: string | null
          tournament_id?: string
          updated_at?: string
          winner_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_temp_winner_id_fkey"
            columns: ["temp_winner_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_player_claims: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          status: string
          token: string
          tournament_player_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          status?: string
          token?: string
          tournament_player_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          status?: string
          token?: string
          tournament_player_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_player_claims_tournament_player_id_fkey"
            columns: ["tournament_player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          created_at: string
          created_by: string | null
          deck_pokemon1: number | null
          deck_pokemon2: number | null
          device_id: string | null
          device_token: string | null
          dropped: boolean
          dropped_at_round: number | null
          has_static_seating: boolean
          id: string
          is_late_entry: boolean
          late_entry_round: number | null
          link_requested_at: string | null
          name: string
          static_seat_number: number | null
          tournament_id: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deck_pokemon1?: number | null
          deck_pokemon2?: number | null
          device_id?: string | null
          device_token?: string | null
          dropped?: boolean
          dropped_at_round?: number | null
          has_static_seating?: boolean
          id?: string
          is_late_entry?: boolean
          late_entry_round?: number | null
          link_requested_at?: string | null
          name: string
          static_seat_number?: number | null
          tournament_id: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deck_pokemon1?: number | null
          deck_pokemon2?: number | null
          device_id?: string | null
          device_token?: string | null
          dropped?: boolean
          dropped_at_round?: number | null
          has_static_seating?: boolean
          id?: string
          is_late_entry?: boolean
          late_entry_round?: number | null
          link_requested_at?: string | null
          name?: string
          static_seat_number?: number | null
          tournament_id?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rounds: {
        Row: {
          duration_minutes: number | null
          ended_at: string | null
          paused_at: string | null
          paused_seconds: number
          round_number: number
          started_at: string
          tournament_id: string
          workspace_id: string
        }
        Insert: {
          duration_minutes?: number | null
          ended_at?: string | null
          paused_at?: string | null
          paused_seconds?: number
          round_number: number
          started_at?: string
          tournament_id: string
          workspace_id: string
        }
        Update: {
          duration_minutes?: number | null
          ended_at?: string | null
          paused_at?: string | null
          paused_seconds?: number
          round_number?: number
          started_at?: string
          tournament_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_rounds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_standings: {
        Row: {
          byes_received: number
          draws: number
          losses: number
          match_points: number
          matches_played: number
          player_id: string
          position: number | null
          tournament_id: string
          updated_at: string
          wins: number
          workspace_id: string
        }
        Insert: {
          byes_received?: number
          draws?: number
          losses?: number
          match_points?: number
          matches_played?: number
          player_id: string
          position?: number | null
          tournament_id: string
          updated_at?: string
          wins?: number
          workspace_id: string
        }
        Update: {
          byes_received?: number
          draws?: number
          losses?: number
          match_points?: number
          matches_played?: number
          player_id?: string
          position?: number | null
          tournament_id?: string
          updated_at?: string
          wins?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_standings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_standings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          allow_late_join: boolean
          created_at: string
          created_by: string
          current_round_started_at: string | null
          description: string | null
          game_format: string | null
          game_id: string
          id: string
          is_public: boolean
          join_code: string | null
          join_enabled: boolean
          late_join_until_round: number | null
          location: string | null
          name: string
          num_rounds: number | null
          public_slug: string | null
          round_duration_minutes: number | null
          round_elapsed_seconds: number
          round_is_paused: boolean
          round_note: string | null
          round_timeup_notified_round: number | null
          starts_at: string | null
          status: string
          tournament_type: string
          workspace_id: string
        }
        Insert: {
          allow_late_join?: boolean
          created_at?: string
          created_by: string
          current_round_started_at?: string | null
          description?: string | null
          game_format?: string | null
          game_id?: string
          id?: string
          is_public?: boolean
          join_code?: string | null
          join_enabled?: boolean
          late_join_until_round?: number | null
          location?: string | null
          name: string
          num_rounds?: number | null
          public_slug?: string | null
          round_duration_minutes?: number | null
          round_elapsed_seconds?: number
          round_is_paused?: boolean
          round_note?: string | null
          round_timeup_notified_round?: number | null
          starts_at?: string | null
          status?: string
          tournament_type?: string
          workspace_id: string
        }
        Update: {
          allow_late_join?: boolean
          created_at?: string
          created_by?: string
          current_round_started_at?: string | null
          description?: string | null
          game_format?: string | null
          game_id?: string
          id?: string
          is_public?: boolean
          join_code?: string | null
          join_enabled?: boolean
          late_join_until_round?: number | null
          location?: string | null
          name?: string
          num_rounds?: number | null
          public_slug?: string | null
          round_duration_minutes?: number | null
          round_elapsed_seconds?: number
          round_is_paused?: boolean
          round_note?: string | null
          round_timeup_notified_round?: number | null
          starts_at?: string | null
          status?: string
          tournament_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_player_links: {
        Row: {
          canonical_key: string
          created_at: string
          created_by: string
          tournament_player_id: string
          workspace_id: string
        }
        Insert: {
          canonical_key: string
          created_at?: string
          created_by: string
          tournament_player_id: string
          workspace_id: string
        }
        Update: {
          canonical_key?: string
          created_at?: string
          created_by?: string
          tournament_player_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_player_links_tournament_player_id_fkey"
            columns: ["tournament_player_id"]
            isOneToOne: true
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_player_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_player_merge_dismissals: {
        Row: {
          created_at: string
          created_by: string
          key_a: string
          key_b: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          key_a: string
          key_b: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          key_a?: string
          key_b?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_player_merge_dismissals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_players: {
        Row: {
          created_at: string
          id: string
          preferred_name: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preferred_name?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preferred_name?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_players_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          timezone: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          timezone?: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          timezone?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_late_entry_pairing_unchecked: {
        Args: { p_player_id: string; p_tournament_id: string }
        Returns: undefined
      }
      _find_possible_duplicate_entry: {
        Args: { p_name: string; p_tournament_id: string }
        Returns: string
      }
      _normalise_player_name: { Args: { p_name: string }; Returns: string }
      _remove_player_from_round_unchecked: {
        Args: { p_player_id: string; p_round: number; p_tournament_id: string }
        Returns: undefined
      }
      accept_player_claim_link: {
        Args: { p_token: string }
        Returns: {
          tournament_id: string
          workspace_id: string
          workspace_slug: string
        }[]
      }
      accept_workspace_invite: { Args: { p_token: string }; Returns: string }
      add_known_players_to_tournament: {
        Args: {
          p_is_late_entry?: boolean
          p_late_entry_round?: number
          p_tournament_id: string
          p_user_ids: string[]
        }
        Returns: {
          created_at: string
          name: string
          player_id: string
          user_id: string
        }[]
      }
      apply_late_entry_pairing: {
        Args: { p_player_id: string; p_tournament_id: string }
        Returns: undefined
      }
      assert_player_access: {
        Args: {
          p_device_token: string
          p_player_id: string
          p_tournament_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deck_pokemon1: number | null
          deck_pokemon2: number | null
          device_id: string | null
          device_token: string | null
          dropped: boolean
          dropped_at_round: number | null
          has_static_seating: boolean
          id: string
          is_late_entry: boolean
          late_entry_round: number | null
          link_requested_at: string | null
          name: string
          static_seat_number: number | null
          tournament_id: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tournament_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      badge_counts: {
        Args: { p_user_ids: string[] }
        Returns: {
          badge_count: number
          badge_id: string
          game_id: string
          user_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      badge_events: {
        Args: { p_user_ids: string[] }
        Returns: {
          badge_id: string
          game_id: string
          played_at: string
          user_id: string
          workspace_id: string
        }[]
      }
      begin_tournament_round: {
        Args: { p_round_number: number; p_tournament_id: string }
        Returns: undefined
      }
      can_manage_workspace: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      cleanup_audit_log: { Args: { days_to_keep?: number }; Returns: number }
      clear_player_link_request: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      create_player_claim_link: {
        Args: { p_tournament_player_id: string }
        Returns: {
          claim_id: string
          token: string
        }[]
      }
      create_workspace: {
        Args: {
          p_name: string
          p_slug: string
          p_timezone?: string
          p_type: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          timezone: string
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace_invite: {
        Args: { p_email: string; p_role?: string; p_workspace_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          token: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_account: { Args: never; Returns: undefined }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_tournament_entry: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      dismiss_merge_suggestion: {
        Args: { p_key_a: string; p_key_b: string; p_workspace_id: string }
        Returns: undefined
      }
      end_tournament_round: {
        Args: { p_round_number: number; p_tournament_id: string }
        Returns: undefined
      }
      enqueue_due_round_timeups: { Args: never; Returns: undefined }
      ensure_personal_workspace: {
        Args: { p_name: string; p_slug: string; p_timezone?: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          timezone: string
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_join_code: { Args: { p_game_id?: string }; Returns: string }
      get_match_result_reports: {
        Args: { p_tournament_id: string }
        Returns: {
          conflict_status: string
          match_id: string
          match_number: number
          player1_id: string
          player1_name: string
          player1_report: string
          player2_id: string
          player2_name: string
          player2_report: string
          round_number: number
        }[]
      }
      get_my_badges: {
        Args: never
        Returns: {
          badge_count: number
          badge_id: string
          game_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_my_card_games: {
        Args: never
        Returns: {
          entries: number
          game_id: string
          last_played: string
        }[]
      }
      get_my_player_entries: {
        Args: never
        Returns: {
          deck_pokemon1: number
          deck_pokemon2: number
          game_id: string
          joined_at: string
          match_wins: number
          player_name: string
          player_position: number
          total_matches: number
          total_players: number
          tournament_id: string
          tournament_name: string
          tournament_player_id: string
          tournament_status: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_my_tournament_entry: {
        Args: { p_tournament_id: string }
        Returns: {
          device_token: string
          player_id: string
        }[]
      }
      get_opponent_went_first: {
        Args: { p_match_ids: string[] }
        Returns: {
          match_id: string
          went_first: boolean
        }[]
      }
      get_organiser_alert_state: {
        Args: never
        Returns: {
          conflict_count: number
          late_entries: number
          latest_late_name: string
          latest_late_round: number
          round_number: number
          settled_matches: number
          total_matches: number
          tournament_id: string
          tournament_name: string
          workspace_slug: string
        }[]
      }
      get_organiser_attendance: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_limit?: number
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          display_name: string
          event_wins: number
          events_played: number
          first_played: string
          identity_key: string
          is_linked: boolean
          last_played: string
          match_wins: number
          matches: number
          top3_finishes: number
        }[]
      }
      get_organiser_deck_diversity: {
        Args: {
          p_bucket?: string
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          decked_entries: number
          distinct_decks: number
          effective_decks: number
          events: number
          period_label: string
          period_start: string
          top_deck_share: number
          top_deck1: number
          top_deck2: number
        }[]
      }
      get_organiser_deck_events: {
        Args: {
          p_deck_pokemon1?: number
          p_deck_pokemon2?: number
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          best_finish: number
          copies: number
          event_status: string
          field_size: number
          match_wins: number
          played_at: string
          total_matches: number
          tournament_id: string
          tournament_name: string
        }[]
      }
      get_organiser_deck_pilots: {
        Args: {
          p_deck_pokemon1?: number
          p_deck_pokemon2?: number
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          best_finish: number
          display_name: string
          entries: number
          event_wins: number
          first_used: string
          identity_key: string
          is_linked: boolean
          last_used: string
          match_wins: number
          total_matches: number
        }[]
      }
      get_organiser_league_table: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_placement_points?: number[]
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          best_finish: number
          byes: number
          display_name: string
          draws: number
          event_wins: number
          events_played: number
          identity_key: string
          is_linked: boolean
          losses: number
          match_points: number
          matches_played: number
          placement_points: number
          total_points: number
          wins: number
        }[]
      }
      get_organiser_meta_share: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          deck_pokemon1: number
          deck_pokemon2: number
          entries: number
          event_wins: number
          first_seen: string
          last_seen: string
          match_wins: number
          pilots: number
          top3_count: number
          total_matches: number
        }[]
      }
      get_organiser_overview_stats: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          avg_field_size: number
          dropped_entries: number
          events_completed: number
          events_total: number
          largest_event_name: string
          largest_event_size: number
          late_entries: number
          linked_players: number
          new_players: number
          returning_players: number
          total_entries: number
          total_matches: number
          unique_players: number
        }[]
      }
      get_organiser_player_decks: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_identity_key: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          best_finish: number
          deck_pokemon1: number
          deck_pokemon2: number
          draws: number
          entries: number
          event_wins: number
          first_used: string
          last_used: string
          losses: number
          matches_played: number
          wins: number
        }[]
      }
      get_organiser_player_events: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_identity_key: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          byes: number
          deck_pokemon1: number
          deck_pokemon2: number
          draws: number
          event_status: string
          field_size: number
          finish_position: number
          losses: number
          matches_played: number
          played_at: string
          tournament_id: string
          tournament_name: string
          wins: number
        }[]
      }
      get_organiser_player_opponents: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_identity_key: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          draws: number
          is_linked: boolean
          last_played: string
          losses: number
          matches_played: number
          opponent_key: string
          opponent_name: string
          wins: number
        }[]
      }
      get_organiser_player_pace: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_min_matches?: number
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          clock_pct: number
          display_name: string
          fastest_minutes: number
          identity_key: string
          is_linked: boolean
          median_minutes: number
          slowest_minutes: number
          timed_matches: number
          went_to_time: number
        }[]
      }
      get_organiser_player_summary: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_identity_key: string
          p_to?: string
          p_tournament_ids?: string[]
          p_workspace_id: string
        }
        Returns: {
          best_finish: number
          byes: number
          display_name: string
          draws: number
          event_wins: number
          events_played: number
          first_seen: string
          is_linked: boolean
          last_seen: string
          losses: number
          matches_played: number
          wins: number
        }[]
      }
      get_organiser_reporting_health: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          awaiting_confirmation: number
          organiser_entered: number
          player_reported: number
          reports_submitted: number
          total_results: number
          unattributed: number
        }[]
      }
      get_organiser_round_health: {
        Args: {
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          clock_pct: number
          drops_at_round: number
          events: number
          longest_minutes: number
          matches: number
          median_minutes: number
          round_minutes: number
          round_number: number
          timed_matches: number
        }[]
      }
      get_organiser_stats_games: {
        Args: { p_workspace_id: string }
        Returns: {
          game_id: string
          players: number
          tournaments: number
        }[]
      }
      get_organiser_stats_years: {
        Args: { p_game_id?: string; p_workspace_id: string }
        Returns: {
          players: number
          tournaments: number
          year: number
        }[]
      }
      get_organiser_timeline: {
        Args: {
          p_bucket?: string
          p_from?: string
          p_game_id?: string
          p_to?: string
          p_workspace_id: string
        }
        Returns: {
          avg_field_size: number
          entries: number
          events: number
          new_players: number
          period_label: string
          period_start: string
          unique_players: number
        }[]
      }
      get_player_deck_stats: {
        Args: { p_from?: string; p_game_id?: string; p_to?: string }
        Returns: {
          deck_pokemon1: number
          deck_pokemon2: number
          first_used: string
          last_used: string
          match_wins: number
          top3_count: number
          top8_count: number
          total_matches: number
          tournaments_played: number
        }[]
      }
      get_player_first_second_stats: {
        Args: {
          p_deck_pokemon1?: number
          p_deck_pokemon2?: number
          p_from?: string
          p_game_id?: string
          p_to?: string
        }
        Returns: {
          insights_count: number
          went_first_total: number
          went_first_wins: number
          went_second_total: number
          went_second_wins: number
        }[]
      }
      get_player_game_pace: {
        Args: { p_from?: string; p_game_id?: string; p_to?: string }
        Returns: {
          clock_pct: number
          fastest_deck1: number
          fastest_deck2: number
          fastest_event: string
          fastest_minutes: number
          fastest_opponent: string
          fastest_won: boolean
          median_minutes: number
          slowest_event: string
          slowest_minutes: number
          slowest_opponent: string
          timed_matches: number
          went_to_time: number
        }[]
      }
      get_player_matchup_matrix: {
        Args: {
          p_deck_pokemon1?: number
          p_deck_pokemon2?: number
          p_from?: string
          p_game_id?: string
          p_to?: string
        }
        Returns: {
          draws: number
          losses: number
          matches_played: number
          opp_pokemon1: number
          opp_pokemon2: number
          wins: number
        }[]
      }
      get_player_overview_stats: {
        Args: { p_from?: string; p_game_id?: string; p_to?: string }
        Returns: {
          best_finish: number
          current_streak: number
          first_count: number
          longest_loss_streak: number
          longest_win_streak: number
          match_wins_no_byes: number
          matches_no_byes: number
          nemesis_losses: number
          nemesis_name: string
          nemesis_wins: number
          ranked_events: number
          top3_count: number
          top8_count: number
          total_completed: number
          total_match_wins: number
          total_matches: number
          victim_losses: number
          victim_name: string
          victim_wins: number
        }[]
      }
      get_player_round_performance: {
        Args: { p_from?: string; p_game_id?: string; p_to?: string }
        Returns: {
          round_number: number
          total: number
          wins: number
        }[]
      }
      get_player_stats_games: {
        Args: never
        Returns: {
          game_id: string
          matches: number
          tournaments: number
        }[]
      }
      get_player_stats_years: {
        Args: { p_game_id?: string }
        Returns: {
          matches: number
          tournaments: number
          year: number
        }[]
      }
      get_player_tournament_view: {
        Args: {
          p_device_token: string
          p_player_id: string
          p_tournament_id: string
        }
        Returns: Json
      }
      get_player_trend: {
        Args: {
          p_bucket?: string
          p_from?: string
          p_game_id?: string
          p_to?: string
        }
        Returns: {
          period_label: string
          period_start: string
          total: number
          wins: number
        }[]
      }
      get_record_change_counts: {
        Args: { p_record_ids: string[]; p_table_name: string }
        Returns: {
          change_count: number
          record_id: string
        }[]
      }
      get_record_history: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: {
          actor: string
          actor_kind: string
          changed_at: string
          changed_fields: string[]
          new_data: Json
          old_data: Json
          operation: string
        }[]
      }
      get_role_rank: { Args: { p_role: string }; Returns: number }
      get_tournament_for_join: {
        Args: { p_tournament_id: string }
        Returns: {
          allow_late_join: boolean
          current_round: number
          description: string
          game_format: string
          game_id: string
          join_enabled: boolean
          location: string
          registered_names: string[]
          round_in_progress: boolean
          starts_at: string
          status: string
          tournament_name: string
        }[]
      }
      get_tournament_player_cards: {
        Args: { p_tournament_id: string }
        Returns: {
          partner_key: string
          slots: Json
          tournament_player_id: string
        }[]
      }
      get_tournaments_summary: {
        Args: { p_player_ids: string[]; p_tournament_ids: string[] }
        Returns: {
          deck_pokemon1: number
          deck_pokemon2: number
          game_id: string
          player_position: number
          status: string
          total_players: number
          tournament_id: string
          tournament_name: string
          workspace_name: string
        }[]
      }
      get_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string
          role: string
          user_id: string
        }[]
      }
      get_workspace_merge_suggestions: {
        Args: { p_threshold?: number; p_workspace_id: string }
        Returns: {
          events_a: number
          events_b: number
          key_a: string
          key_b: string
          linked_a: boolean
          linked_b: boolean
          name_a: string
          name_b: string
          similarity: number
        }[]
      }
      get_workspace_player_dismissals: {
        Args: { p_identity_key: string; p_workspace_id: string }
        Returns: {
          other_events: number
          other_key: string
          other_name: string
        }[]
      }
      get_workspace_player_entries: {
        Args: { p_identity_key: string; p_workspace_id: string }
        Returns: {
          entry_name: string
          is_overridden: boolean
          played_at: string
          tournament_name: string
          tournament_player_id: string
        }[]
      }
      get_workspace_role: { Args: { p_workspace_id: string }; Returns: string }
      invoke_send_push: { Args: { p_payload: Json }; Returns: undefined }
      is_player_in_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      link_organiser_push: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      list_workspace_players: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string
          preferred_name: string
          tournaments_played: number
          user_id: string
        }[]
      }
      merge_workspace_players: {
        Args: {
          p_source_keys: string[]
          p_target_key: string
          p_workspace_id: string
        }
        Returns: number
      }
      pause_tournament_round: {
        Args: { p_round_number: number; p_tournament_id: string }
        Returns: undefined
      }
      purge_expired_personal_data: { Args: never; Returns: undefined }
      purge_unclaimed_player_entries: {
        Args: { p_days?: number }
        Returns: number
      }
      refresh_my_badges: { Args: never; Returns: number }
      remove_player_from_round: {
        Args: { p_player_id: string; p_round: number }
        Returns: undefined
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      request_player_entry_link: {
        Args: { p_entry_name: string; p_tournament_id: string }
        Returns: undefined
      }
      resolve_join_code: {
        Args: { p_code: string }
        Returns: {
          tournament_id: string
          tournament_name: string
        }[]
      }
      restore_merge_suggestion: {
        Args: { p_key_a: string; p_key_b: string; p_workspace_id: string }
        Returns: undefined
      }
      resume_tournament_round: {
        Args: { p_round_number: number; p_tournament_id: string }
        Returns: undefined
      }
      revoke_player_claim_link: {
        Args: { p_claim_id: string }
        Returns: undefined
      }
      revoke_workspace_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      save_my_card: {
        Args: { p_game_id: string; p_partner_key: string; p_slots?: Json }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_device_token: string
          p_endpoint: string
          p_p256dh: string
          p_tournament_player_id: string
        }
        Returns: undefined
      }
      save_tournament_standings: {
        Args: { p_rows: Json; p_tournament_id: string }
        Returns: undefined
      }
      self_claim_player_entry: {
        Args: { p_device_token: string; p_tournament_player_id: string }
        Returns: {
          tournament_id: string
          tournament_name: string
        }[]
      }
      self_join_tournament: {
        Args: {
          p_confirmed_distinct?: boolean
          p_device_id?: string
          p_player_name: string
          p_pokemon1?: number
          p_pokemon2?: number
          p_tournament_id: string
        }
        Returns: {
          device_token: string
          duplicate_of: string
          player_id: string
          tournament_name: string
        }[]
      }
      set_audit_actor: { Args: { p_label: string }; Returns: undefined }
      set_player_deck: {
        Args: {
          p_device_token: string
          p_player_id: string
          p_pokemon1: number
          p_pokemon2: number
          p_tournament_id: string
        }
        Returns: undefined
      }
      set_tournament_allow_late_join: {
        Args: { p_enabled: boolean; p_tournament_id: string }
        Returns: {
          join_code: string
        }[]
      }
      set_tournament_join_enabled: {
        Args: { p_enabled: boolean; p_tournament_id: string }
        Returns: {
          join_code: string
        }[]
      }
      split_workspace_player_entries: {
        Args: { p_entry_ids: string[]; p_workspace_id: string }
        Returns: string
      }
      submit_match_result: {
        Args: {
          p_device_token: string
          p_match_id: string
          p_player_id: string
          p_reported_outcome: string
        }
        Returns: Json
      }
      unlink_workspace_player_entries: {
        Args: { p_entry_ids: string[]; p_workspace_id: string }
        Returns: number
      }
      upsert_match_insights: {
        Args: {
          p_match_id: string
          p_opp_pokemon1: number
          p_opp_pokemon2: number
          p_went_first: boolean
        }
        Returns: undefined
      }
      workspace_player_identities: {
        Args: { p_workspace_id: string }
        Returns: {
          display_name: string
          dropped: boolean
          game_id: string
          identity_key: string
          is_late_entry: boolean
          is_linked: boolean
          played_at: string
          tournament_id: string
          tournament_player_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

