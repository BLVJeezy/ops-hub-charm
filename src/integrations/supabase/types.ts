export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actions: {
        Row: {
          action_description: string
          client: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          notes: string | null
          result: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["action_status"]
          updated_at: string
          waiting_period: Database["public"]["Enums"]["waiting_period"]
        }
        Insert: {
          action_description: string
          client: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          result?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          waiting_period?: Database["public"]["Enums"]["waiting_period"]
        }
        Update: {
          action_description?: string
          client?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          result?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
          waiting_period?: Database["public"]["Enums"]["waiting_period"]
        }
        Relationships: [
          {
            foreignKeyName: "actions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_status_log: {
        Row: {
          client: string
          created_at: string
          created_by: string | null
          date: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          client: string
          created_at?: string
          created_by?: string | null
          date?: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          client?: string
          created_at?: string
          created_by?: string | null
          date?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_status_log_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_address: string | null
          billing_frequency: Database["public"]["Enums"]["billing_frequency"]
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string | null
          health: Database["public"]["Enums"]["health_status"]
          id: string
          location: string | null
          monthly_fee: number | null
          name: string
          next_followup_date: string | null
          notes: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date: string | null
          sector: Database["public"]["Enums"]["client_sector"]
          seo_end_date: string | null
          seo_package: Database["public"]["Enums"]["seo_package"]
          seo_start_date: string | null
          setup_fee: number | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          vat_number: string | null
          website_billing_frequency: Database["public"]["Enums"]["billing_frequency"]
          website_monthly_fee: number | null
          website_needed: boolean
          website_setup_fee: number | null
          website_yearly_fee: number | null
          writeoff_reason: Database["public"]["Enums"]["writeoff_reason"] | null
          yearly_fee: number | null
        }
        Insert: {
          billing_address?: string | null
          billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          location?: string | null
          monthly_fee?: number | null
          name: string
          next_followup_date?: string | null
          notes?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date?: string | null
          sector?: Database["public"]["Enums"]["client_sector"]
          seo_end_date?: string | null
          seo_package?: Database["public"]["Enums"]["seo_package"]
          seo_start_date?: string | null
          setup_fee?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          vat_number?: string | null
          website_billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          website_monthly_fee?: number | null
          website_needed?: boolean
          website_setup_fee?: number | null
          website_yearly_fee?: number | null
          writeoff_reason?:
            | Database["public"]["Enums"]["writeoff_reason"]
            | null
          yearly_fee?: number | null
        }
        Update: {
          billing_address?: string | null
          billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          location?: string | null
          monthly_fee?: number | null
          name?: string
          next_followup_date?: string | null
          notes?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date?: string | null
          sector?: Database["public"]["Enums"]["client_sector"]
          seo_end_date?: string | null
          seo_package?: Database["public"]["Enums"]["seo_package"]
          seo_start_date?: string | null
          setup_fee?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          vat_number?: string | null
          website_billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          website_monthly_fee?: number | null
          website_needed?: boolean
          website_setup_fee?: number | null
          website_yearly_fee?: number | null
          writeoff_reason?:
            | Database["public"]["Enums"]["writeoff_reason"]
            | null
          yearly_fee?: number | null
        }
        Relationships: []
      }
      contact_log: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"]
          client: string
          created_at: string
          created_by: string | null
          date: string
          direction: Database["public"]["Enums"]["contact_direction"]
          id: string
          note: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          client: string
          created_at?: string
          created_by?: string | null
          date?: string
          direction?: Database["public"]["Enums"]["contact_direction"]
          id?: string
          note: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          client?: string
          created_at?: string
          created_by?: string | null
          date?: string
          direction?: Database["public"]["Enums"]["contact_direction"]
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_log_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          id: string
          linked_client: string | null
          monthly_cost: number
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          linked_client?: string | null
          monthly_cost?: number
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          linked_client?: string | null
          monthly_cost?: number
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_linked_client_fkey"
            columns: ["linked_client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client: string | null
          client_address: string | null
          client_name: string | null
          client_vat_number: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          invoice_number: number | null
          last_reminder_at: string | null
          line_items: Json
          reminder_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          updated_at: string
          vat_note: string | null
        }
        Insert: {
          client?: string | null
          client_address?: string | null
          client_name?: string | null
          client_vat_number?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          invoice_number?: number | null
          last_reminder_at?: string | null
          line_items?: Json
          reminder_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
          updated_at?: string
          vat_note?: string | null
        }
        Update: {
          client?: string | null
          client_address?: string | null
          client_name?: string | null
          client_vat_number?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          invoice_number?: number | null
          last_reminder_at?: string | null
          line_items?: Json
          reminder_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
          updated_at?: string
          vat_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_submissions: {
        Row: {
          billing_address: string | null
          business_name: string
          contact_email: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          keyword_1: string | null
          keyword_2: string | null
          keyword_3: string | null
          linked_client_id: string | null
          location: string
          notes: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          sector: Database["public"]["Enums"]["client_sector"]
          services_interested: string[] | null
          submitted_at: string
          target_audience: string | null
          updated_at: string
          vat_number: string | null
          website_needed: string[] | null
        }
        Insert: {
          billing_address?: string | null
          business_name: string
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          keyword_1?: string | null
          keyword_2?: string | null
          keyword_3?: string | null
          linked_client_id?: string | null
          location: string
          notes?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          sector: Database["public"]["Enums"]["client_sector"]
          services_interested?: string[] | null
          submitted_at?: string
          target_audience?: string | null
          updated_at?: string
          vat_number?: string | null
          website_needed?: string[] | null
        }
        Update: {
          billing_address?: string | null
          business_name?: string
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          keyword_1?: string | null
          keyword_2?: string | null
          keyword_3?: string | null
          linked_client_id?: string | null
          location?: string
          notes?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          sector?: Database["public"]["Enums"]["client_sector"]
          services_interested?: string[] | null
          submitted_at?: string
          target_audience?: string | null
          updated_at?: string
          vat_number?: string | null
          website_needed?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_submissions_linked_client_id_fkey"
            columns: ["linked_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      action_status: "Planned" | "In Progress" | "Completed" | "Blocked"
      app_role: "admin" | "sales" | "ops"
      billing_frequency: "Monthly" | "Yearly"
      client_sector:
        | "Plumber"
        | "Electrician"
        | "HVAC"
        | "Construction"
        | "Cleaning"
        | "Medical/Wholesale"
        | "Car Detailing"
        | "Other"
      client_status: "Prospect" | "Active" | "Paused" | "Write-off"
      contact_channel: "WhatsApp" | "Phone" | "Email" | "In person" | "Other"
      contact_direction: "Outreach" | "Response"
      expense_category:
        | "Tool"
        | "Directory/Citations"
        | "Subscription"
        | "Other"
      health_status: "Not set" | "Green" | "Orange" | "Red"
      invoice_status: "Draft" | "Sent" | "Paid"
      pipeline_stage:
        | "Found"
        | "Contacted"
        | "Interested"
        | "Meeting Booked"
        | "Meeting Done"
        | "Proposal Sent"
        | "Negotiating"
        | "Converted"
        | "Write-off"
      review_status: "Pending" | "Approved" | "Rejected"
      seo_package: "None" | "Basic" | "Premium" | "Custom" | "Pilot"
      waiting_period: "1 week" | "2 weeks" | "3 weeks" | "4 weeks" | "Ongoing"
      writeoff_reason:
        | "No response"
        | "Too expensive"
        | "Not interested"
        | "Bad fit"
        | "Other"
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
  public: {
    Enums: {
      action_status: ["Planned", "In Progress", "Completed", "Blocked"],
      app_role: ["admin", "sales", "ops"],
      billing_frequency: ["Monthly", "Yearly"],
      client_sector: [
        "Plumber",
        "Electrician",
        "HVAC",
        "Construction",
        "Cleaning",
        "Medical/Wholesale",
        "Car Detailing",
        "Other",
      ],
      client_status: ["Prospect", "Active", "Paused", "Write-off"],
      contact_channel: ["WhatsApp", "Phone", "Email", "In person", "Other"],
      contact_direction: ["Outreach", "Response"],
      expense_category: [
        "Tool",
        "Directory/Citations",
        "Subscription",
        "Other",
      ],
      health_status: ["Not set", "Green", "Orange", "Red"],
      invoice_status: ["Draft", "Sent", "Paid"],
      pipeline_stage: [
        "Found",
        "Contacted",
        "Interested",
        "Meeting Booked",
        "Meeting Done",
        "Proposal Sent",
        "Negotiating",
        "Converted",
        "Write-off",
      ],
      review_status: ["Pending", "Approved", "Rejected"],
      seo_package: ["None", "Basic", "Premium", "Custom", "Pilot"],
      waiting_period: ["1 week", "2 weeks", "3 weeks", "4 weeks", "Ongoing"],
      writeoff_reason: [
        "No response",
        "Too expensive",
        "Not interested",
        "Bad fit",
        "Other",
      ],
    },
  },
} as const
