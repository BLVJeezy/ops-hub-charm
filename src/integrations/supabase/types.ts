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
      automation_health: {
        Row: {
          alerted_at: string | null
          automation_id: string
          checked_at: string
          detail: string | null
          since: string
          status: string
        }
        Insert: {
          alerted_at?: string | null
          automation_id: string
          checked_at?: string
          detail?: string | null
          since?: string
          status: string
        }
        Update: {
          alerted_at?: string | null
          automation_id?: string
          checked_at?: string
          detail?: string | null
          since?: string
          status?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          at: string
          bytes: number | null
          error: string | null
          file: string | null
          id: number
          manifest: Json | null
          ok: boolean
          rows: number | null
          sha256: string | null
          tables: number | null
          target: string
        }
        Insert: {
          at?: string
          bytes?: number | null
          error?: string | null
          file?: string | null
          id?: number
          manifest?: Json | null
          ok: boolean
          rows?: number | null
          sha256?: string | null
          tables?: number | null
          target: string
        }
        Update: {
          at?: string
          bytes?: number | null
          error?: string | null
          file?: string | null
          id?: number
          manifest?: Json | null
          ok?: boolean
          rows?: number | null
          sha256?: string | null
          tables?: number | null
          target?: string
        }
        Relationships: []
      }
      bank_rules: {
        Row: {
          account_id: string
          created_at: string
          direction: string | null
          id: string
          pattern: string
          priority: number
        }
        Insert: {
          account_id: string
          created_at?: string
          direction?: string | null
          id?: string
          pattern: string
          priority?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          direction?: string | null
          id?: string
          pattern?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account: string
          amount: number
          bank: string
          categorised_by: string | null
          category_account_id: string | null
          currency: string
          date: string
          description: string
          fee: number | null
          fx_rate: number | null
          hash: string
          id: string
          imported_at: string
          invoice_id: string | null
          note: string | null
          orig_amount: number | null
          orig_currency: string | null
          reviewed: boolean
          source: string
          status: string
          type: string | null
        }
        Insert: {
          account?: string
          amount: number
          bank?: string
          categorised_by?: string | null
          category_account_id?: string | null
          currency?: string
          date: string
          description: string
          fee?: number | null
          fx_rate?: number | null
          hash: string
          id?: string
          imported_at?: string
          invoice_id?: string | null
          note?: string | null
          orig_amount?: number | null
          orig_currency?: string | null
          reviewed?: boolean
          source?: string
          status?: string
          type?: string | null
        }
        Update: {
          account?: string
          amount?: number
          bank?: string
          categorised_by?: string | null
          category_account_id?: string | null
          currency?: string
          date?: string
          description?: string
          fee?: number | null
          fx_rate?: number | null
          hash?: string
          id?: string
          imported_at?: string
          invoice_id?: string | null
          note?: string | null
          orig_amount?: number | null
          orig_currency?: string | null
          reviewed?: boolean
          source?: string
          status?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_category_account_id_fkey"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      beheer_content: {
        Row: {
          content: Json
          published_at: string
          site: string
        }
        Insert: {
          content?: Json
          published_at?: string
          site: string
        }
        Update: {
          content?: Json
          published_at?: string
          site?: string
        }
        Relationships: []
      }
      beheer_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          kind: string
          site: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          kind?: string
          site: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          kind?: string
          site?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          attachments: Json
          client_id: string | null
          company: string | null
          created_at: string
          email: string
          ends_at: string
          gcal_sent_at: string | null
          google_event_id: string | null
          id: string
          location: string | null
          mode: string
          moved_from: string | null
          name: string
          note: string | null
          outcome: string | null
          phone: string | null
          starts_at: string
          status: string
          topics: string[]
        }
        Insert: {
          attachments?: Json
          client_id?: string | null
          company?: string | null
          created_at?: string
          email: string
          ends_at: string
          gcal_sent_at?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          mode?: string
          moved_from?: string | null
          name: string
          note?: string | null
          outcome?: string | null
          phone?: string | null
          starts_at: string
          status?: string
          topics?: string[]
        }
        Update: {
          attachments?: Json
          client_id?: string | null
          company?: string | null
          created_at?: string
          email?: string
          ends_at?: string
          gcal_sent_at?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          mode?: string
          moved_from?: string | null
          name?: string
          note?: string | null
          outcome?: string | null
          phone?: string | null
          starts_at?: string
          status?: string
          topics?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_busy: {
        Row: {
          client_id: string | null
          edited_at: string | null
          ends_at: string
          id: string
          kind: string
          moved_from: string | null
          outcome: string | null
          source: string
          starts_at: string
          synced_at: string
          title: string | null
        }
        Insert: {
          client_id?: string | null
          edited_at?: string | null
          ends_at: string
          id?: string
          kind?: string
          moved_from?: string | null
          outcome?: string | null
          source?: string
          starts_at: string
          synced_at?: string
          title?: string | null
        }
        Update: {
          client_id?: string | null
          edited_at?: string | null
          ends_at?: string
          id?: string
          kind?: string
          moved_from?: string | null
          outcome?: string | null
          source?: string
          starts_at?: string
          synced_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_busy_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_agreements: {
        Row: {
          body: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          monthly_fee: number | null
          reference: string
          signed_at: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          monthly_fee?: number | null
          reference: string
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          monthly_fee?: number | null
          reference?: string
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client: string
          content_type: string | null
          created_at: string
          document_date: string | null
          file_name: string
          file_size: number | null
          id: string
          last_sent_at: string | null
          last_sent_to: string | null
          storage_path: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          client: string
          content_type?: string | null
          created_at?: string
          document_date?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          last_sent_at?: string | null
          last_sent_to?: string | null
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          client?: string
          content_type?: string | null
          created_at?: string
          document_date?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          last_sent_at?: string | null
          last_sent_to?: string | null
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_recurring_tasks: {
        Row: {
          active: boolean
          assignee: string
          cadence: string
          client_id: string | null
          created_at: string
          created_by: string | null
          day: number
          generated_until: string | null
          id: string
          steps: number | null
          title: string
        }
        Insert: {
          active?: boolean
          assignee?: string
          cadence: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          day: number
          generated_until?: string | null
          id?: string
          steps?: number | null
          title: string
        }
        Update: {
          active?: boolean
          assignee?: string
          cadence?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          day?: number
          generated_until?: string | null
          id?: string
          steps?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_recurring_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          attachments: Json
          client_id: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          details: string | null
          done_at: string | null
          done_mailed_at: string | null
          estimate_eur: number | null
          estimate_minutes: number | null
          id: string
          kind: string
          note: string | null
          pages: number | null
          priority: number | null
          run_started_at: string | null
          start_mailed_at: string | null
          started_at: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          urgency: string
          wished_date: string | null
          worked_seconds: number
        }
        Insert: {
          attachments?: Json
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          details?: string | null
          done_at?: string | null
          done_mailed_at?: string | null
          estimate_eur?: number | null
          estimate_minutes?: number | null
          id?: string
          kind?: string
          note?: string | null
          pages?: number | null
          priority?: number | null
          run_started_at?: string | null
          start_mailed_at?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          urgency?: string
          wished_date?: string | null
          worked_seconds?: number
        }
        Update: {
          attachments?: Json
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          details?: string | null
          done_at?: string | null
          done_mailed_at?: string | null
          estimate_eur?: number | null
          estimate_minutes?: number | null
          id?: string
          kind?: string
          note?: string | null
          pages?: number | null
          priority?: number | null
          run_started_at?: string | null
          start_mailed_at?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          urgency?: string
          wished_date?: string | null
          worked_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
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
      client_tasks: {
        Row: {
          assignee: string
          breaks: number
          client_id: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          due_date: string | null
          id: string
          laps: Json
          recurring_id: string | null
          seconds: number
          started_at: string | null
          steps_done: number
          steps_total: number | null
          title: string
        }
        Insert: {
          assignee?: string
          breaks?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          laps?: Json
          recurring_id?: string | null
          seconds?: number
          started_at?: string | null
          steps_done?: number
          steps_total?: number | null
          title: string
        }
        Update: {
          assignee?: string
          breaks?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          laps?: Json
          recurring_id?: string | null
          seconds?: number
          started_at?: string | null
          steps_done?: number
          steps_total?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "client_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_videos: {
        Row: {
          client_id: string
          created_at: string
          id: string
          month: string
          posted_at: string | null
          sent_at: string | null
          slot: number
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          month: string
          posted_at?: string | null
          sent_at?: string | null
          slot: number
          status: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          month?: string
          posted_at?: string | null
          sent_at?: string | null
          slot?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_videos_client_id_fkey"
            columns: ["client_id"]
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
          brand_color: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string | null
          health: Database["public"]["Enums"]["health_status"]
          id: string
          is_internal: boolean
          location: string | null
          monthly_fee: number | null
          name: string
          next_followup_date: string | null
          notes: string | null
          parent_client_id: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date: string | null
          request_token: string | null
          sector: Database["public"]["Enums"]["client_sector"]
          seo_end_date: string | null
          seo_package: Database["public"]["Enums"]["seo_package"]
          seo_start_date: string | null
          setup_fee: number | null
          social_end_date: string | null
          social_monthly_fee: number | null
          social_setup_fee: number | null
          social_start_date: string | null
          social_videos_per_month: number | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          vat_number: string | null
          video_token: string | null
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
          brand_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          is_internal?: boolean
          location?: string | null
          monthly_fee?: number | null
          name: string
          next_followup_date?: string | null
          notes?: string | null
          parent_client_id?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date?: string | null
          request_token?: string | null
          sector?: Database["public"]["Enums"]["client_sector"]
          seo_end_date?: string | null
          seo_package?: Database["public"]["Enums"]["seo_package"]
          seo_start_date?: string | null
          setup_fee?: number | null
          social_end_date?: string | null
          social_monthly_fee?: number | null
          social_setup_fee?: number | null
          social_start_date?: string | null
          social_videos_per_month?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          vat_number?: string | null
          video_token?: string | null
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
          brand_color?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["health_status"]
          id?: string
          is_internal?: boolean
          location?: string | null
          monthly_fee?: number | null
          name?: string
          next_followup_date?: string | null
          notes?: string | null
          parent_client_id?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          renewal_date?: string | null
          request_token?: string | null
          sector?: Database["public"]["Enums"]["client_sector"]
          seo_end_date?: string | null
          seo_package?: Database["public"]["Enums"]["seo_package"]
          seo_start_date?: string | null
          setup_fee?: number | null
          social_end_date?: string | null
          social_monthly_fee?: number | null
          social_setup_fee?: number | null
          social_start_date?: string | null
          social_videos_per_month?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          vat_number?: string | null
          video_token?: string | null
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
        Relationships: [
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      daily_briefings: {
        Row: {
          chapters: Json | null
          created_at: string
          day: string
          emailed_at: string | null
          render_error: string | null
          rendered_at: string | null
          snapshot: Json
          status: string
          video_path: string | null
        }
        Insert: {
          chapters?: Json | null
          created_at?: string
          day: string
          emailed_at?: string | null
          render_error?: string | null
          rendered_at?: string | null
          snapshot: Json
          status: string
          video_path?: string | null
        }
        Update: {
          chapters?: Json | null
          created_at?: string
          day?: string
          emailed_at?: string | null
          render_error?: string | null
          rendered_at?: string | null
          snapshot?: Json
          status?: string
          video_path?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          email_id: string | null
          from_domain: string | null
          id: number
          type: string
        }
        Insert: {
          created_at?: string
          email_id?: string | null
          from_domain?: string | null
          id?: never
          type: string
        }
        Update: {
          created_at?: string
          email_id?: string | null
          from_domain?: string | null
          id?: never
          type?: string
        }
        Relationships: []
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
      health_checks: {
        Row: {
          checked_at: string
          error: string | null
          id: number
          kind: string
          ok: boolean
          response_ms: number | null
          site_id: string
          status_code: number | null
          target: string | null
        }
        Insert: {
          checked_at?: string
          error?: string | null
          id?: never
          kind: string
          ok: boolean
          response_ms?: number | null
          site_id: string
          status_code?: number | null
          target?: string | null
        }
        Update: {
          checked_at?: string
          error?: string | null
          id?: never
          kind?: string
          ok?: boolean
          response_ms?: number | null
          site_id?: string
          status_code?: number | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_checks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          detail: string | null
          id: string
          kind: string
          last_notified_at: string | null
          notify_count: number
          opened_at: string
          resolution_note: string | null
          resolved_at: string | null
          severity: string
          site_id: string
          status: string
          title: string
        }
        Insert: {
          detail?: string | null
          id?: string
          kind: string
          last_notified_at?: string | null
          notify_count?: number
          opened_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          severity: string
          site_id: string
          status?: string
          title: string
        }
        Update: {
          detail?: string | null
          id?: string
          kind?: string
          last_notified_at?: string | null
          notify_count?: number
          opened_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          site_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bounced_at: string | null
          client: string | null
          client_address: string | null
          client_name: string | null
          client_vat_number: string | null
          complained_at: string | null
          created_at: string
          created_by: string | null
          date: string
          delivered_at: string | null
          email_status: string | null
          id: string
          invoice_number: number | null
          last_reminder_at: string | null
          line_items: Json
          next_repeat_on: string | null
          opened_at: string | null
          reminder_count: number
          repeat_day: number | null
          repeat_hour: number | null
          repeat_monthly: boolean
          repeat_parent: string | null
          resend_message_id: string | null
          schedule_error: string | null
          schedule_locked_at: string | null
          scheduled_send_at: string | null
          scheduled_send_hour: number | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          updated_at: string
          vat_note: string | null
        }
        Insert: {
          bounced_at?: string | null
          client?: string | null
          client_address?: string | null
          client_name?: string | null
          client_vat_number?: string | null
          complained_at?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          delivered_at?: string | null
          email_status?: string | null
          id?: string
          invoice_number?: number | null
          last_reminder_at?: string | null
          line_items?: Json
          next_repeat_on?: string | null
          opened_at?: string | null
          reminder_count?: number
          repeat_day?: number | null
          repeat_hour?: number | null
          repeat_monthly?: boolean
          repeat_parent?: string | null
          resend_message_id?: string | null
          schedule_error?: string | null
          schedule_locked_at?: string | null
          scheduled_send_at?: string | null
          scheduled_send_hour?: number | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
          updated_at?: string
          vat_note?: string | null
        }
        Update: {
          bounced_at?: string | null
          client?: string | null
          client_address?: string | null
          client_name?: string | null
          client_vat_number?: string | null
          complained_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          delivered_at?: string | null
          email_status?: string | null
          id?: string
          invoice_number?: number | null
          last_reminder_at?: string | null
          line_items?: Json
          next_repeat_on?: string | null
          opened_at?: string | null
          reminder_count?: number
          repeat_day?: number | null
          repeat_hour?: number | null
          repeat_monthly?: boolean
          repeat_parent?: string | null
          resend_message_id?: string | null
          schedule_error?: string | null
          schedule_locked_at?: string | null
          scheduled_send_at?: string | null
          scheduled_send_hour?: number | null
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
          {
            foreignKeyName: "invoices_repeat_parent_fkey"
            columns: ["repeat_parent"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          source: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description: string
          id?: string
          source?: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          source?: string
          source_id?: string | null
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_id: string
          client_id: string | null
          credit: number
          debit: number
          entry_id: string
          id: string
          memo: string | null
          vat_code: string | null
        }
        Insert: {
          account_id: string
          client_id?: string | null
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          memo?: string | null
          vat_code?: string | null
        }
        Update: {
          account_id?: string
          client_id?: string | null
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          memo?: string | null
          vat_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          system_key: string | null
          type: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          system_key?: string | null
          type: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          system_key?: string | null
          type?: string
        }
        Relationships: []
      }
      ledger_audit: {
        Row: {
          action: string
          at: string
          detail: Json | null
          entry_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          detail?: Json | null
          entry_id?: string | null
          id?: never
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          detail?: Json | null
          entry_id?: string | null
          id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      ledger_periods: {
        Row: {
          locked_at: string | null
          locked_by: string | null
          month: string
        }
        Insert: {
          locked_at?: string | null
          locked_by?: string | null
          month: string
        }
        Update: {
          locked_at?: string | null
          locked_by?: string | null
          month?: string
        }
        Relationships: []
      }
      monitored_sites: {
        Row: {
          analytics_provider: string
          analytics_synced_at: string | null
          api_endpoints: Json
          api_status: string | null
          check_interval_minutes: number
          circle: string
          client_id: string | null
          created_at: string
          created_by: string | null
          db_health_apikey: string | null
          db_health_url: string | null
          db_provider: string
          db_status: string | null
          email_domain: string | null
          email_status: string | null
          enabled: boolean
          hosting_provider: string
          id: string
          is_critical: boolean
          last_backup_at: string | null
          last_checked_at: string | null
          last_deploy_at: string | null
          last_deploy_state: string | null
          last_deploy_url: string | null
          last_error: string | null
          last_http_status: number | null
          last_response_ms: number | null
          last_status: string
          lovable_project_id: string | null
          name: string
          notes: string | null
          repo: string | null
          ssl_ok: boolean | null
          tracking_id: string
          updated_at: string
          url: string
          vercel_project_id: string | null
        }
        Insert: {
          analytics_provider?: string
          analytics_synced_at?: string | null
          api_endpoints?: Json
          api_status?: string | null
          check_interval_minutes?: number
          circle?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          db_health_apikey?: string | null
          db_health_url?: string | null
          db_provider?: string
          db_status?: string | null
          email_domain?: string | null
          email_status?: string | null
          enabled?: boolean
          hosting_provider?: string
          id?: string
          is_critical?: boolean
          last_backup_at?: string | null
          last_checked_at?: string | null
          last_deploy_at?: string | null
          last_deploy_state?: string | null
          last_deploy_url?: string | null
          last_error?: string | null
          last_http_status?: number | null
          last_response_ms?: number | null
          last_status?: string
          lovable_project_id?: string | null
          name: string
          notes?: string | null
          repo?: string | null
          ssl_ok?: boolean | null
          tracking_id?: string
          updated_at?: string
          url: string
          vercel_project_id?: string | null
        }
        Update: {
          analytics_provider?: string
          analytics_synced_at?: string | null
          api_endpoints?: Json
          api_status?: string | null
          check_interval_minutes?: number
          circle?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          db_health_apikey?: string | null
          db_health_url?: string | null
          db_provider?: string
          db_status?: string | null
          email_domain?: string | null
          email_status?: string | null
          enabled?: boolean
          hosting_provider?: string
          id?: string
          is_critical?: boolean
          last_backup_at?: string | null
          last_checked_at?: string | null
          last_deploy_at?: string | null
          last_deploy_state?: string | null
          last_deploy_url?: string | null
          last_error?: string | null
          last_http_status?: number | null
          last_response_ms?: number | null
          last_status?: string
          lovable_project_id?: string | null
          name?: string
          notes?: string | null
          repo?: string | null
          ssl_ok?: boolean | null
          tracking_id?: string
          updated_at?: string
          url?: string
          vercel_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitored_sites_client_id_fkey"
            columns: ["client_id"]
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
      site_breakdown_daily: {
        Row: {
          day: string
          dim: string
          label: string
          site_id: string
          value: number
        }
        Insert: {
          day: string
          dim: string
          label: string
          site_id: string
          value?: number
        }
        Update: {
          day?: string
          dim?: string
          label?: string
          site_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_breakdown_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_bridges: {
        Row: {
          apikey: string | null
          kind: string
          last_error: string | null
          last_sync_at: string | null
          site_id: string
          token: string
          url: string
        }
        Insert: {
          apikey?: string | null
          kind: string
          last_error?: string | null
          last_sync_at?: string | null
          site_id: string
          token: string
          url: string
        }
        Update: {
          apikey?: string | null
          kind?: string
          last_error?: string | null
          last_sync_at?: string | null
          site_id?: string
          token?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_bridges_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_change_batches: {
        Row: {
          action: string
          by_whom: string
          changes: number
          client_id: string | null
          created_at: string
          flags: string[]
          id: string
          prev_version_id: string | null
          reviewed_at: string | null
          site: string
          version_id: string | null
        }
        Insert: {
          action?: string
          by_whom?: string
          changes?: number
          client_id?: string | null
          created_at?: string
          flags?: string[]
          id?: string
          prev_version_id?: string | null
          reviewed_at?: string | null
          site: string
          version_id?: string | null
        }
        Update: {
          action?: string
          by_whom?: string
          changes?: number
          client_id?: string | null
          created_at?: string
          flags?: string[]
          id?: string
          prev_version_id?: string | null
          reviewed_at?: string | null
          site?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_change_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      site_changes: {
        Row: {
          after: string | null
          batch_id: string
          before: string | null
          id: string
          key: string
          kind: string
          page: string | null
          seo: boolean
          tag: string | null
          why: string[]
        }
        Insert: {
          after?: string | null
          batch_id: string
          before?: string | null
          id?: string
          key: string
          kind: string
          page?: string | null
          seo?: boolean
          tag?: string | null
          why?: string[]
        }
        Update: {
          after?: string | null
          batch_id?: string
          before?: string | null
          id?: string
          key?: string
          kind?: string
          page?: string | null
          seo?: boolean
          tag?: string | null
          why?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "site_changes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "site_change_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      site_pages_daily: {
        Row: {
          day: string
          path: string
          site_id: string
          views: number
        }
        Insert: {
          day: string
          path: string
          site_id: string
          views?: number
        }
        Update: {
          day?: string
          path?: string
          site_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_pages_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_records: {
        Row: {
          amount: number | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          ends_at: string | null
          external_id: string
          extra: Json
          id: string
          kind: string
          message: string | null
          site_id: string
          source: string | null
          source_created_at: string | null
          starts_at: string | null
          status: string | null
          synced_at: string
          title: string | null
        }
        Insert: {
          amount?: number | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ends_at?: string | null
          external_id: string
          extra?: Json
          id?: string
          kind: string
          message?: string | null
          site_id: string
          source?: string | null
          source_created_at?: string | null
          starts_at?: string | null
          status?: string | null
          synced_at?: string
          title?: string | null
        }
        Update: {
          amount?: number | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          ends_at?: string | null
          external_id?: string
          extra?: Json
          id?: string
          kind?: string
          message?: string | null
          site_id?: string
          source?: string | null
          source_created_at?: string | null
          starts_at?: string | null
          status?: string | null
          synced_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_records_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_sources_daily: {
        Row: {
          day: string
          site_id: string
          source: string
          views: number
        }
        Insert: {
          day: string
          site_id: string
          source: string
          views?: number
        }
        Update: {
          day?: string
          site_id?: string
          source?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_sources_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visitor_hashes: {
        Row: {
          day: string
          hash: string
          site_id: string
        }
        Insert: {
          day: string
          hash: string
          site_id: string
        }
        Update: {
          day?: string
          hash?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visitor_hashes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits_daily: {
        Row: {
          bounce_rate: number | null
          day: string
          pageviews: number
          session_seconds: number | null
          site_id: string
          source: string
          visitors: number
        }
        Insert: {
          bounce_rate?: number | null
          day: string
          pageviews?: number
          session_seconds?: number | null
          site_id: string
          source?: string
          visitors?: number
        }
        Update: {
          bounce_rate?: number | null
          day?: string
          pageviews?: number
          session_seconds?: number | null
          site_id?: string
          source?: string
          visitors?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "monitored_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json
          author: string
          body: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          author: string
          body?: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          author?: string
          body?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          client_id: string | null
          client_seen_at: string | null
          created_at: string
          id: string
          last_author: string
          request_id: string | null
          site: string
          solyn_seen_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_seen_at?: string | null
          created_at?: string
          id?: string
          last_author?: string
          request_id?: string | null
          site: string
          solyn_seen_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_seen_at?: string | null
          created_at?: string
          id?: string
          last_author?: string
          request_id?: string | null
          site?: string
          solyn_seen_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
        ]
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
      video_assets: {
        Row: {
          caption: string
          created_at: string
          id: string
          kind: string
          mime_type: string
          sort_order: number
          storage_path: string
          thumb_path: string | null
          uploaded_by: string
          version: number | null
          video_project_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          kind: string
          mime_type: string
          sort_order?: number
          storage_path: string
          thumb_path?: string | null
          uploaded_by: string
          version?: number | null
          video_project_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
          thumb_path?: string | null
          uploaded_by?: string
          version?: number | null
          video_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_assets_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_events: {
        Row: {
          created_at: string
          id: string
          label: string
          video_project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          video_project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          video_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_events_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_feedback: {
        Row: {
          attachments: Json
          comment: string
          contact_name: string
          created_at: string
          decision: string
          email_error: string | null
          id: string
          request_id: string | null
          seen_at: string | null
          task_id: string | null
          timestamps: Json
          version: number
          video_project_id: string
        }
        Insert: {
          attachments?: Json
          comment?: string
          contact_name?: string
          created_at?: string
          decision: string
          email_error?: string | null
          id?: string
          request_id?: string | null
          seen_at?: string | null
          task_id?: string | null
          timestamps?: Json
          version: number
          video_project_id: string
        }
        Update: {
          attachments?: Json
          comment?: string
          contact_name?: string
          created_at?: string
          decision?: string
          email_error?: string | null
          id?: string
          request_id?: string | null
          seen_at?: string | null
          task_id?: string | null
          timestamps?: Json
          version?: number
          video_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_feedback_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_feedback_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_feedback_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_projects: {
        Row: {
          approved_at: string | null
          brief: string
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          month: string
          notify_client: boolean
          platform: string[]
          revisions_included: number
          revisions_used: number
          slot: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          brief?: string
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          month: string
          notify_client?: boolean
          platform?: string[]
          revisions_included?: number
          revisions_used?: number
          slot: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          brief?: string
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          month?: string
          notify_client?: boolean
          platform?: string[]
          revisions_included?: number
          revisions_used?: number
          slot?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      video_uploads: {
        Row: {
          caption: string
          completed_at: string | null
          created_at: string
          id: string
          kind: string
          mime_type: string
          size: number
          storage_path: string
          uploaded_by: string
          version: number | null
          video_project_id: string
        }
        Insert: {
          caption?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: string
          mime_type: string
          size: number
          storage_path: string
          uploaded_by: string
          version?: number | null
          video_project_id: string
        }
        Update: {
          caption?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          size?: number
          storage_path?: string
          uploaded_by?: string
          version?: number | null
          video_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_uploads_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      backup_export: {
        Args: {
          _limit?: number
          _offset?: number
          _table?: string
          _token: string
        }
        Returns: Json
      }
      backup_report: { Args: { _run: Json; _token: string }; Returns: number }
      backup_status: { Args: never; Returns: Json }
      backup_token_ok: { Args: { _token: string }; Returns: boolean }
      bank_sync: { Args: never; Returns: Json }
      briefing_snapshot: { Args: never; Returns: Json }
      cron_status: {
        Args: never
        Returns: {
          jobname: string
          last_run: string
          last_status: string
        }[]
      }
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
      generate_recurring_tasks: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      ledger_post: {
        Args: { _date: string; _description: string; _lines: Json }
        Returns: string
      }
      ledger_sync: { Args: never; Returns: Json }
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
      site_daily_stats: {
        Args: { _days?: number; _site: string }
        Returns: {
          avg_ms: number
          checks: number
          day: string
          kind: string
          ok: number
          p95_ms: number
        }[]
      }
      track_pageview: {
        Args: {
          _day: string
          _hash: string
          _path: string
          _source: string
          _tracking_id: string
        }
        Returns: boolean
      }
      video_complete_upload: {
        Args: { _by: string; _client: string; _upload: string }
        Returns: string
      }
      video_decide: {
        Args: {
          _attachments: Json
          _client: string
          _comment: string
          _decision: string
          _name: string
          _timestamps: Json
          _version: number
          _video: string
        }
        Returns: string
      }
      video_staff_status: {
        Args: { _notify: boolean; _status: string; _video: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
