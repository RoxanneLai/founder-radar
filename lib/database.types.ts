// Schema snapshot initialized with Supabase postgres-meta, aligned with versioned migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      event_publication_reviews: {
        Row: {
          id: string;
          event_id: string;
          source_id: string;
          review_token: string;
          review_snapshot: Json;
          approved_at: string;
          approved_by_role: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          source_id: string;
          review_token: string;
          review_snapshot: Json;
          approved_at?: string;
          approved_by_role?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          source_id?: string;
          review_token?: string;
          review_snapshot?: Json;
          approved_at?: string;
          approved_by_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_publication_reviews_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_publication_reviews_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "event_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      event_sources: {
        Row: {
          content_hash: string | null;
          content_text: string | null;
          created_at: string;
          discovered_by_run_id: string | null;
          event_id: string | null;
          external_id: string | null;
          fetched_at: string | null;
          first_seen_at: string;
          http_status: number | null;
          id: string;
          last_attempt_at: string | null;
          last_attempt_error: string | null;
          last_seen_at: string;
          raw_payload: Json;
          registration_url: string | null;
          source_kind: string;
          source_name: string;
          source_url: string;
          updated_at: string;
        };
        Insert: {
          content_hash?: string | null;
          content_text?: string | null;
          created_at?: string;
          discovered_by_run_id?: string | null;
          event_id?: string | null;
          external_id?: string | null;
          fetched_at?: string | null;
          first_seen_at?: string;
          http_status?: number | null;
          id?: string;
          last_attempt_at?: string | null;
          last_attempt_error?: string | null;
          last_seen_at?: string;
          raw_payload?: Json;
          registration_url?: string | null;
          source_kind?: string;
          source_name: string;
          source_url: string;
          updated_at?: string;
        };
        Update: {
          content_hash?: string | null;
          content_text?: string | null;
          created_at?: string;
          discovered_by_run_id?: string | null;
          event_id?: string | null;
          external_id?: string | null;
          fetched_at?: string | null;
          first_seen_at?: string;
          http_status?: number | null;
          id?: string;
          last_attempt_at?: string | null;
          last_attempt_error?: string | null;
          last_seen_at?: string;
          raw_payload?: Json;
          registration_url?: string | null;
          source_kind?: string;
          source_name?: string;
          source_url?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_sources_discovered_by_run_id_fkey";
            columns: ["discovered_by_run_id"];
            isOneToOne: false;
            referencedRelation: "search_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_sources_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          address_line: string | null;
          borough: string | null;
          categories: string[];
          city: string;
          country_code: string;
          created_at: string;
          currency_code: string | null;
          ends_at: string | null;
          event_format: string;
          first_seen_at: string;
          founder_score: number | null;
          id: string;
          investor_score: number | null;
          is_fixture: boolean;
          last_seen_at: string;
          neighborhood: string | null;
          networking_score: number | null;
          organizer_name: string | null;
          potential_downside: string | null;
          price_amount_cents: number | null;
          publication_status: string;
          public_registration_url: string | null;
          published_at: string | null;
          recommendation: string | null;
          region: string;
          registration_status: string;
          scoring_version: string | null;
          starts_at: string;
          time_zone: string;
          title: string;
          updated_at: string;
          venue_name: string | null;
        };
        Insert: {
          address_line?: string | null;
          borough?: string | null;
          categories?: string[];
          city?: string;
          country_code?: string;
          created_at?: string;
          currency_code?: string | null;
          ends_at?: string | null;
          event_format?: string;
          first_seen_at?: string;
          founder_score?: number | null;
          id?: string;
          investor_score?: number | null;
          is_fixture?: boolean;
          last_seen_at?: string;
          neighborhood?: string | null;
          networking_score?: number | null;
          organizer_name?: string | null;
          potential_downside?: string | null;
          price_amount_cents?: number | null;
          publication_status?: string;
          public_registration_url?: string | null;
          published_at?: string | null;
          recommendation?: string | null;
          region?: string;
          registration_status?: string;
          scoring_version?: string | null;
          starts_at: string;
          time_zone?: string;
          title: string;
          updated_at?: string;
          venue_name?: string | null;
        };
        Update: {
          address_line?: string | null;
          borough?: string | null;
          categories?: string[];
          city?: string;
          country_code?: string;
          created_at?: string;
          currency_code?: string | null;
          ends_at?: string | null;
          event_format?: string;
          first_seen_at?: string;
          founder_score?: number | null;
          id?: string;
          investor_score?: number | null;
          is_fixture?: boolean;
          last_seen_at?: string;
          neighborhood?: string | null;
          networking_score?: number | null;
          organizer_name?: string | null;
          potential_downside?: string | null;
          price_amount_cents?: number | null;
          publication_status?: string;
          public_registration_url?: string | null;
          published_at?: string | null;
          recommendation?: string | null;
          region?: string;
          registration_status?: string;
          scoring_version?: string | null;
          starts_at?: string;
          time_zone?: string;
          title?: string;
          updated_at?: string;
          venue_name?: string | null;
        };
        Relationships: [];
      };
      search_runs: {
        Row: {
          agent_name: string;
          agent_version: string | null;
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          metadata: Json;
          provider: string;
          search_parameters: Json;
          sources_created: number;
          sources_discovered: number;
          sources_updated: number;
          started_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          agent_name: string;
          agent_version?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          metadata?: Json;
          provider: string;
          search_parameters?: Json;
          sources_created?: number;
          sources_discovered?: number;
          sources_updated?: number;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          agent_name?: string;
          agent_version?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          metadata?: Json;
          provider?: string;
          search_parameters?: Json;
          sources_created?: number;
          sources_discovered?: number;
          sources_updated?: number;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_event_review: {
        Args: { p_event_id: string; p_source_id?: string };
        Returns: Json;
      };
      publish_reviewed_event: {
        Args: {
          p_event_id: string;
          p_source_id: string;
          p_review_token: string;
          p_approved?: boolean;
        };
        Returns: Json;
      };
      public_listing_url: { Args: { p_url: string }; Returns: string };
      ingest_event_source: {
        Args: {
          p_event?: Json;
          p_observed_at?: string;
          p_run_id: string;
          p_source: Json;
        };
        Returns: {
          event_id: string;
          event_written: boolean;
          source_created: boolean;
          source_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
