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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_counters: {
        Row: {
          account_id: string
          key: string
          value: number
        }
        Insert: {
          account_id: string
          key: string
          value?: number
        }
        Update: {
          account_id?: string
          key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_counters_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_integrations: {
        Row: {
          account_id: string
          config: Json
          created_at: string
          id: string
          last_error: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          config?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          config?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_integrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_templates: {
        Row: {
          account_id: string
          applied_at: string
          applied_by: string | null
          area: string
          payload: Json
          template_key: string
        }
        Insert: {
          account_id: string
          applied_at?: string
          applied_by?: string | null
          area: string
          payload?: Json
          template_key: string
        }
        Update: {
          account_id?: string
          applied_at?: string
          applied_by?: string | null
          area?: string
          payload?: Json
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          account_id: string
          body: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          done_at: string | null
          due_at: string | null
          id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          body?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          body?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_spend: {
        Row: {
          account_id: string
          amount: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approvals: {
        Row: {
          account_id: string
          agent_id: string | null
          args: Json
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          outcome: string | null
          root_agent_id: string | null
          run_id: string | null
          run_state: string
          status: string
          summary: string
          tool: string
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          args?: Json
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          outcome?: string | null
          root_agent_id?: string | null
          run_id?: string | null
          run_state: string
          status?: string
          summary?: string
          tool: string
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          args?: Json
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          outcome?: string | null
          root_agent_id?: string | null
          run_id?: string | null
          run_state?: string
          status?: string
          summary?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_root_agent_id_fkey"
            columns: ["root_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversation_state: {
        Row: {
          account_id: string
          agent_id: string | null
          collected: Json
          conversation_id: string
          greeted_at: string | null
          survey: Json
          typing_until: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          collected?: Json
          conversation_id: string
          greeted_at?: string | null
          survey?: Json
          typing_until?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          collected?: Json
          conversation_id?: string
          greeted_at?: string | null
          survey?: Json
          typing_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversation_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversation_state_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_eval_runs: {
        Row: {
          account_id: string
          agent_id: string
          agent_version: number
          cost_usd: number | null
          created_at: string
          error: string | null
          estimated_cost_usd: number | null
          finished_at: string | null
          id: string
          model: string | null
          pass_rate: number | null
          passed: number
          results: Json
          started_by: string | null
          status: string
          total: number
        }
        Insert: {
          account_id: string
          agent_id: string
          agent_version: number
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          estimated_cost_usd?: number | null
          finished_at?: string | null
          id?: string
          model?: string | null
          pass_rate?: number | null
          passed?: number
          results?: Json
          started_by?: string | null
          status?: string
          total?: number
        }
        Update: {
          account_id?: string
          agent_id?: string
          agent_version?: number
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          estimated_cost_usd?: number | null
          finished_at?: string | null
          id?: string
          model?: string | null
          pass_rate?: number | null
          passed?: number
          results?: Json
          started_by?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_eval_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_eval_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_evals: {
        Row: {
          account_id: string
          active: boolean
          agent_id: string
          created_at: string
          created_by: string | null
          expected: string
          fail_tool: string | null
          history: Json
          id: string
          kind: string
          must_handoff: boolean
          question: string
          source: string
        }
        Insert: {
          account_id: string
          active?: boolean
          agent_id: string
          created_at?: string
          created_by?: string | null
          expected?: string
          fail_tool?: string | null
          history?: Json
          id?: string
          kind?: string
          must_handoff?: boolean
          question: string
          source?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          agent_id?: string
          created_at?: string
          created_by?: string | null
          expected?: string
          fail_tool?: string | null
          history?: Json
          id?: string
          kind?: string
          must_handoff?: boolean
          question?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_evals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_handoffs: {
        Row: {
          account_id: string
          answered_at: string | null
          conversation_id: string
          created_at: string
          due_at: string | null
          from_agent_id: string | null
          id: string
          kind: string
          reason: string
          summary: string
          to_agent_id: string | null
          to_user_id: string | null
        }
        Insert: {
          account_id: string
          answered_at?: string | null
          conversation_id: string
          created_at?: string
          due_at?: string | null
          from_agent_id?: string | null
          id?: string
          kind: string
          reason?: string
          summary?: string
          to_agent_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          account_id?: string
          answered_at?: string | null
          conversation_id?: string
          created_at?: string
          due_at?: string | null
          from_agent_id?: string | null
          id?: string
          kind?: string
          reason?: string
          summary?: string
          to_agent_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_handoffs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_handoffs_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_handoffs_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_presence: {
        Row: {
          account_id: string
          pause_reason: string | null
          since: string
          status: string
          updated_at: string
          user_id: string
          wrap_up_until: string | null
        }
        Insert: {
          account_id: string
          pause_reason?: string | null
          since?: string
          status?: string
          updated_at?: string
          user_id: string
          wrap_up_until?: string | null
        }
        Update: {
          account_id?: string
          pause_reason?: string | null
          since?: string
          status?: string
          updated_at?: string
          user_id?: string
          wrap_up_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_presence_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_presence_log: {
        Row: {
          account_id: string
          ended_at: string | null
          id: number
          pause_reason: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          ended_at?: string | null
          id?: never
          pause_reason?: string | null
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          account_id?: string
          ended_at?: string | null
          id?: never
          pause_reason?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_presence_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          account_id: string
          created_at: string
          level: number
          skill: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          level?: number
          skill: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          level?: number
          skill?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_survey_answers: {
        Row: {
          account_id: string
          agent_id: string | null
          comment: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          score: number
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          score: number
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_survey_answers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_survey_answers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_survey_answers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "agent_survey_answers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_survey_answers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_calls: {
        Row: {
          account_id: string
          agent_id: string | null
          args: Json
          conversation_id: string | null
          created_at: string
          dry_run: boolean
          error: string | null
          eval_run_id: string | null
          external_log_id: string | null
          id: string
          kind: string
          latency_ms: number | null
          ok: boolean
          result: Json | null
          run_id: string | null
          tool: string
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          args?: Json
          conversation_id?: string | null
          created_at?: string
          dry_run?: boolean
          error?: string | null
          eval_run_id?: string | null
          external_log_id?: string | null
          id?: string
          kind: string
          latency_ms?: number | null
          ok?: boolean
          result?: Json | null
          run_id?: string | null
          tool: string
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          args?: Json
          conversation_id?: string | null
          created_at?: string
          dry_run?: boolean
          error?: string | null
          eval_run_id?: string | null
          external_log_id?: string | null
          id?: string
          kind?: string
          latency_ms?: number | null
          ok?: boolean
          result?: Json | null
          run_id?: string | null
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          account_id: string
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          slug: string
        }
        Insert: {
          account_id: string
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          slug: string
        }
        Update: {
          account_id?: string
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_runs: {
        Row: {
          account_id: string
          agent_id: string | null
          confidence: number | null
          conversation_id: string
          created_at: string
          finished_at: string | null
          id: string
          latency_ms: number | null
          reason: string | null
          reply_message_id: string | null
          sources: Json
          status: string
          trigger_message_id: string | null
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          confidence?: number | null
          conversation_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          reason?: string | null
          reply_message_id?: string | null
          sources?: Json
          status?: string
          trigger_message_id?: string | null
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          confidence?: number | null
          conversation_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          reason?: string | null
          reply_message_id?: string | null
          sources?: Json
          status?: string
          trigger_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_reply_message_id_fkey"
            columns: ["reply_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          account_id: string
          activated_at: string | null
          activated_by: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          goal: string
          handoff_message: string
          id: string
          instructions: string
          is_entry: boolean
          name: string
          persona: string
          priority: number
          role: string
          settings: Json
          source: string
          status: string
          status_reason: string | null
          style: Json
          template_key: string | null
          tone: string
          tools_changed_at: string | null
          updated_at: string
          version: number
          voice_agent_id: string | null
          voice_id: string | null
        }
        Insert: {
          account_id: string
          activated_at?: string | null
          activated_by?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          goal?: string
          handoff_message?: string
          id?: string
          instructions?: string
          is_entry?: boolean
          name: string
          persona?: string
          priority?: number
          role: string
          settings?: Json
          source?: string
          status?: string
          status_reason?: string | null
          style?: Json
          template_key?: string | null
          tone?: string
          tools_changed_at?: string | null
          updated_at?: string
          version?: number
          voice_agent_id?: string | null
          voice_id?: string | null
        }
        Update: {
          account_id?: string
          activated_at?: string | null
          activated_by?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          goal?: string
          handoff_message?: string
          id?: string
          instructions?: string
          is_entry?: boolean
          name?: string
          persona?: string
          priority?: number
          role?: string
          settings?: Json
          source?: string
          status?: string
          status_reason?: string | null
          style?: Json
          template_key?: string | null
          tone?: string
          tools_changed_at?: string | null
          updated_at?: string
          version?: number
          voice_agent_id?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_classifications: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          id: string
          intent: string | null
          model: string | null
          next_step: string | null
          score: number
          signals: Json
          summary: string | null
          temperature: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          id?: string
          intent?: string | null
          model?: string | null
          next_step?: string | null
          score: number
          signals?: Json
          summary?: string | null
          temperature: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          intent?: string | null
          model?: string | null
          next_step?: string | null
          score?: number
          signals?: Json
          summary?: string | null
          temperature?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_classifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_classifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "ai_classifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_eval_cases: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          expected: string | null
          id: string
          must_handoff: boolean
          question: string
          tags: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          expected?: string | null
          id?: string
          must_handoff?: boolean
          question: string
          tags?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          expected?: string | null
          id?: string
          must_handoff?: boolean
          question?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_cases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_eval_runs: {
        Row: {
          accept_rate: number | null
          account_id: string
          created_at: string
          id: string
          passed: number
          results: Json
          started_by: string | null
          total: number
        }
        Insert: {
          accept_rate?: number | null
          account_id: string
          created_at?: string
          id?: string
          passed?: number
          results?: Json
          started_by?: string | null
          total?: number
        }
        Update: {
          accept_rate?: number | null
          account_id?: string
          created_at?: string
          id?: string
          passed?: number
          results?: Json
          started_by?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          account_id: string
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          meta: Json
        }
        Insert: {
          account_id: string
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: number
          meta?: Json
        }
        Update: {
          account_id?: string
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: number
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          account_id: string
          automation_id: string
          contact_id: string | null
          created_at: string
          data: Json
          id: number
          message: string | null
          node_id: string | null
          node_type: string | null
          run_id: string | null
          status: string
        }
        Insert: {
          account_id: string
          automation_id: string
          contact_id?: string | null
          created_at?: string
          data?: Json
          id?: number
          message?: string | null
          node_id?: string | null
          node_type?: string | null
          run_id?: string | null
          status: string
        }
        Update: {
          account_id?: string
          automation_id?: string
          contact_id?: string | null
          created_at?: string
          data?: Json
          id?: number
          message?: string | null
          node_id?: string | null
          node_type?: string | null
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "automation_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          account_id: string
          automation_id: string
          contact_id: string
          context: Json
          created_at: string
          current_node: string | null
          deal_id: string | null
          enrolled_at: string
          enrolled_by: string | null
          exit_reason: string | null
          finished_at: string | null
          id: string
          next_at: string | null
          source: string
          status: string
          step_seq: number
          updated_at: string
        }
        Insert: {
          account_id: string
          automation_id: string
          contact_id: string
          context?: Json
          created_at?: string
          current_node?: string | null
          deal_id?: string | null
          enrolled_at?: string
          enrolled_by?: string | null
          exit_reason?: string | null
          finished_at?: string | null
          id?: string
          next_at?: string | null
          source?: string
          status?: string
          step_seq?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          automation_id?: string
          contact_id?: string
          context?: Json
          created_at?: string
          current_node?: string | null
          deal_id?: string | null
          enrolled_at?: string
          enrolled_by?: string | null
          exit_reason?: string | null
          finished_at?: string | null
          id?: string
          next_at?: string | null
          source?: string
          status?: string
          step_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "automation_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          account_id: string
          activated_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          exit_rules: Json
          graph: Json
          guards: Json
          id: string
          kind: string
          name: string
          reentry: string
          status: string
          template_key: string | null
          trigger: Json
          updated_at: string
          version: number
        }
        Insert: {
          account_id: string
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          exit_rules?: Json
          graph?: Json
          guards?: Json
          id?: string
          kind?: string
          name: string
          reentry?: string
          status?: string
          template_key?: string | null
          trigger?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          account_id?: string
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          exit_rules?: Json
          graph?: Json
          guards?: Json
          id?: string
          kind?: string
          name?: string
          reentry?: string
          status?: string
          template_key?: string | null
          trigger?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pages: {
        Row: {
          account_id: string
          availability: Json
          buffer_min: number
          confirmation_message: string | null
          create_deal: boolean
          created_at: string
          created_by: string | null
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          location: string
          location_detail: string | null
          members: Json
          min_notice_min: number
          mode: string
          owner_user_id: string | null
          playbook_id: string | null
          questions: Json
          slug: string
          step_min: number
          title: string
          updated_at: string
          window_days: number
        }
        Insert: {
          account_id: string
          availability?: Json
          buffer_min?: number
          confirmation_message?: string | null
          create_deal?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          location?: string
          location_detail?: string | null
          members?: Json
          min_notice_min?: number
          mode?: string
          owner_user_id?: string | null
          playbook_id?: string | null
          questions?: Json
          slug: string
          step_min?: number
          title: string
          updated_at?: string
          window_days?: number
        }
        Update: {
          account_id?: string
          availability?: Json
          buffer_min?: number
          confirmation_message?: string | null
          create_deal?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          location?: string
          location_detail?: string | null
          members?: Json
          min_notice_min?: number
          mode?: string
          owner_user_id?: string | null
          playbook_id?: string | null
          questions?: Json
          slug?: string
          step_min?: number
          title?: string
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          account_id: string
          created_at: string
          email: string | null
          id: string
          last_error: string | null
          last_pull_at: string | null
          last_sync_at: string | null
          provider: string
          scopes: string[]
          status: string
          sync_cursor: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string | null
          id?: string
          last_error?: string | null
          last_pull_at?: string | null
          last_sync_at?: string | null
          provider: string
          scopes?: string[]
          status?: string
          sync_cursor?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string | null
          id?: string
          last_error?: string | null
          last_pull_at?: string | null
          last_sync_at?: string | null
          provider?: string
          scopes?: string[]
          status?: string
          sync_cursor?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_center_settings: {
        Row: {
          account_id: string
          auto_callback_on_abandon: boolean
          dialing: Json
          dialing_accepted_at: string | null
          dialing_accepted_by: string | null
          offer_callback: boolean
          offer_whatsapp: boolean
          owner_wait_seconds: number
          reservation_seconds: number
          sla_risk_seconds: number
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_callback_on_abandon?: boolean
          dialing?: Json
          dialing_accepted_at?: string | null
          dialing_accepted_by?: string | null
          offer_callback?: boolean
          offer_whatsapp?: boolean
          owner_wait_seconds?: number
          reservation_seconds?: number
          sla_risk_seconds?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_callback_on_abandon?: boolean
          dialing?: Json
          dialing_accepted_at?: string | null
          dialing_accepted_by?: string | null
          offer_callback?: boolean
          offer_whatsapp?: boolean
          owner_wait_seconds?: number
          reservation_seconds?: number
          sla_risk_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_center_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_queues: {
        Row: {
          account_id: string
          business_hours: Json
          channels: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          overflow: string
          overflow_agent_id: string | null
          overflow_redirect: string | null
          required_level: number
          skills: string[]
          sla_seconds: number
          strategy: string
          zadarma_scenario_id: string | null
        }
        Insert: {
          account_id: string
          business_hours?: Json
          channels?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          overflow?: string
          overflow_agent_id?: string | null
          overflow_redirect?: string | null
          required_level?: number
          skills?: string[]
          sla_seconds?: number
          strategy?: string
          zadarma_scenario_id?: string | null
        }
        Update: {
          account_id?: string
          business_hours?: Json
          channels?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          overflow?: string
          overflow_agent_id?: string | null
          overflow_redirect?: string | null
          required_level?: number
          skills?: string[]
          sla_seconds?: number
          strategy?: string
          zadarma_scenario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_queues_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_queues_overflow_agent_fk"
            columns: ["overflow_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          account_id: string
          answered_at: string | null
          billseconds: number | null
          campaign_id: string | null
          contact_id: string | null
          cost_usd: number | null
          created_at: string
          data_collection: Json | null
          direction: string
          disposition: string | null
          disposition_reason: string | null
          duration_seconds: number | null
          el_conversation_id: string | null
          ended_at: string | null
          from_number: string | null
          hangup_cause: string | null
          id: string
          metadata: Json
          pbx_call_id: string | null
          phone_number_id: string | null
          queue_id: string | null
          recording_path: string | null
          recording_status: string
          score: number | null
          scorecard: Json | null
          sentiment: string | null
          started_at: string
          status: string
          summary: string | null
          to_number: string | null
          transcript: string | null
          transcript_segments: Json
          updated_at: string
          user_id: string | null
          voice_agent_id: string | null
        }
        Insert: {
          account_id: string
          answered_at?: string | null
          billseconds?: number | null
          campaign_id?: string | null
          contact_id?: string | null
          cost_usd?: number | null
          created_at?: string
          data_collection?: Json | null
          direction: string
          disposition?: string | null
          disposition_reason?: string | null
          duration_seconds?: number | null
          el_conversation_id?: string | null
          ended_at?: string | null
          from_number?: string | null
          hangup_cause?: string | null
          id?: string
          metadata?: Json
          pbx_call_id?: string | null
          phone_number_id?: string | null
          queue_id?: string | null
          recording_path?: string | null
          recording_status?: string
          score?: number | null
          scorecard?: Json | null
          sentiment?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_segments?: Json
          updated_at?: string
          user_id?: string | null
          voice_agent_id?: string | null
        }
        Update: {
          account_id?: string
          answered_at?: string | null
          billseconds?: number | null
          campaign_id?: string | null
          contact_id?: string | null
          cost_usd?: number | null
          created_at?: string
          data_collection?: Json | null
          direction?: string
          disposition?: string | null
          disposition_reason?: string | null
          duration_seconds?: number | null
          el_conversation_id?: string | null
          ended_at?: string | null
          from_number?: string | null
          hangup_cause?: string | null
          id?: string
          metadata?: Json
          pbx_call_id?: string | null
          phone_number_id?: string | null
          queue_id?: string | null
          recording_path?: string | null
          recording_status?: string
          score?: number | null
          scorecard?: Json | null
          sentiment?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_segments?: Json
          updated_at?: string
          user_id?: string | null
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "call_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          account_id: string
          ai_enabled: boolean
          config: Json
          created_at: string
          external_id: string | null
          handle: string | null
          id: string
          is_shared: boolean
          last_event_at: string | null
          name: string
          owner_user_id: string | null
          platform: string
          provider: string
          status: string
          status_detail: string | null
          updated_at: string
          webhook_token: string
        }
        Insert: {
          account_id: string
          ai_enabled?: boolean
          config?: Json
          created_at?: string
          external_id?: string | null
          handle?: string | null
          id?: string
          is_shared?: boolean
          last_event_at?: string | null
          name: string
          owner_user_id?: string | null
          platform: string
          provider: string
          status?: string
          status_detail?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          account_id?: string
          ai_enabled?: boolean
          config?: Json
          created_at?: string
          external_id?: string | null
          handle?: string | null
          id?: string
          is_shared?: boolean
          last_event_at?: string | null
          name?: string
          owner_user_id?: string | null
          platform?: string
          provider?: string
          status?: string
          status_detail?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_tips: {
        Row: {
          account_id: string
          body: string | null
          created_at: string
          dismissed: boolean
          id: string
          kind: string
          meeting_id: string
          playbook_item: string | null
          source: string
          title: string
        }
        Insert: {
          account_id: string
          body?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          kind: string
          meeting_id: string
          playbook_item?: string | null
          source?: string
          title: string
        }
        Update: {
          account_id?: string
          body?: string | null
          created_at?: string
          dismissed?: boolean
          id?: string
          kind?: string
          meeting_id?: string
          playbook_item?: string | null
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_tips_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_tips_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          account_id: string
          active: boolean
          category: string | null
          created_at: string
          id: string
          name: string
          percent: number
          pipeline_id: string | null
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name: string
          percent: number
          pipeline_id?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          percent?: number
          pipeline_id?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          account_id: string
          amount: number
          base: number
          created_at: string
          deal_id: string
          id: string
          paid_at: string | null
          percent: number
          rule_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          base: number
          created_at?: string
          deal_id: string
          id?: string
          paid_at?: string | null
          percent: number
          rule_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          base?: number
          created_at?: string
          deal_id?: string
          id?: string
          paid_at?: string | null
          percent?: number
          rule_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          account_id: string
          address: Json
          cnpj: string | null
          created_at: string
          created_by: string | null
          custom: Json
          domain: string | null
          email: string | null
          id: string
          industry: string | null
          legal_name: string | null
          name: string
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          size: string | null
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          account_id: string
          address?: Json
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          size?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_id?: string
          address?: Json
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          size?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      composio_connections: {
        Row: {
          account_id: string
          alias: string | null
          channel_id: string | null
          connected_account_id: string | null
          connected_by: string | null
          created_at: string
          id: string
          last_error: string | null
          status: string
          toolkit: string
          trigger_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          alias?: string | null
          channel_id?: string | null
          connected_account_id?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          status?: string
          toolkit: string
          trigger_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          alias?: string | null
          channel_id?: string | null
          connected_account_id?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          status?: string
          toolkit?: string
          trigger_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "composio_connections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composio_connections_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      composio_settings: {
        Row: {
          account_id: string
          last_error: string | null
          session_id: string | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          webhook_subscription_id: string | null
        }
        Insert: {
          account_id: string
          last_error?: string | null
          session_id?: string | null
          status?: string
          tested_at?: string | null
          updated_at?: string
          user_id: string
          webhook_subscription_id?: string | null
        }
        Update: {
          account_id?: string
          last_error?: string | null
          session_id?: string | null
          status?: string
          tested_at?: string | null
          updated_at?: string
          user_id?: string
          webhook_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "composio_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          account_id: string
          basis: string
          channel: string
          contact_id: string
          created_at: string
          id: string
          proof: Json
          recorded_by: string | null
          source: string
          status: string
        }
        Insert: {
          account_id: string
          basis?: string
          channel: string
          contact_id: string
          created_at?: string
          id?: string
          proof?: Json
          recorded_by?: string | null
          source?: string
          status: string
        }
        Update: {
          account_id?: string
          basis?: string
          channel?: string
          contact_id?: string
          created_at?: string
          id?: string
          proof?: Json
          recorded_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_identities: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          display_name: string | null
          handle: string
          id: string
          platform: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          display_name?: string | null
          handle: string
          id?: string
          platform: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          platform?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_identities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_interests: {
        Row: {
          account_id: string
          confidence: number
          contact_id: string
          created_at: string
          evidence: string | null
          id: string
          product_id: string
          source: string
          updated_at: string
        }
        Insert: {
          account_id: string
          confidence?: number
          contact_id: string
          created_at?: string
          evidence?: string | null
          id?: string
          product_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          confidence?: number
          contact_id?: string
          created_at?: string
          evidence?: string | null
          id?: string
          product_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_interests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_interests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          ai_intent: string | null
          ai_next_step: string | null
          ai_summary: string | null
          avatar_url: string | null
          city: string | null
          classified_at: string | null
          company: string | null
          company_id: string | null
          created_at: string
          custom: Json
          email: string | null
          first_touch: Json | null
          id: string
          job_title: string | null
          last_interaction_at: string | null
          last_touch: Json | null
          lifecycle: string
          name: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          score: number | null
          source: string | null
          tags: string[]
          temperature: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ai_intent?: string | null
          ai_next_step?: string | null
          ai_summary?: string | null
          avatar_url?: string | null
          city?: string | null
          classified_at?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          custom?: Json
          email?: string | null
          first_touch?: Json | null
          id?: string
          job_title?: string | null
          last_interaction_at?: string | null
          last_touch?: Json | null
          lifecycle?: string
          name?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          tags?: string[]
          temperature?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ai_intent?: string | null
          ai_next_step?: string | null
          ai_summary?: string | null
          avatar_url?: string | null
          city?: string | null
          classified_at?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          custom?: Json
          email?: string | null
          first_touch?: Json | null
          id?: string
          job_title?: string | null
          last_interaction_at?: string | null
          last_touch?: Json | null
          lifecycle?: string
          name?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          tags?: string[]
          temperature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_highlights: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          excerpt: string
          id: string
          note: string | null
          source: string
          source_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          excerpt: string
          id?: string
          note?: string | null
          source: string
          source_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string
          id?: string
          note?: string | null
          source?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_highlights_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          account_id: string
          ai_enabled: boolean
          ai_handoff_at: string | null
          ai_handoff_reason: string | null
          assignee_user_id: string | null
          avatar_url: string | null
          channel_id: string | null
          contact_id: string | null
          created_at: string
          external_thread_id: string
          id: string
          is_group: boolean
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          snoozed_until: string | null
          status: string
          tags: string[]
          title: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id: string
          ai_enabled?: boolean
          ai_handoff_at?: string | null
          ai_handoff_reason?: string | null
          assignee_user_id?: string | null
          avatar_url?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_thread_id: string
          id?: string
          is_group?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          snoozed_until?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          ai_enabled?: boolean
          ai_handoff_at?: string | null
          ai_handoff_reason?: string | null
          assignee_user_id?: string | null
          avatar_url?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_thread_id?: string
          id?: string
          is_group?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          snoozed_until?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_connections: {
        Row: {
          account_id: string
          connected_label: string | null
          created_at: string
          created_by: string | null
          cursors: Json
          direction: string
          last_error: string | null
          last_result: Json | null
          last_sync_at: string | null
          provider: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          connected_label?: string | null
          created_at?: string
          created_by?: string | null
          cursors?: Json
          direction?: string
          last_error?: string | null
          last_result?: Json | null
          last_sync_at?: string | null
          provider: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          connected_label?: string | null
          created_at?: string
          created_by?: string | null
          cursors?: Json
          direction?: string
          last_error?: string | null
          last_result?: Json | null
          last_sync_at?: string | null
          provider?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sync_connections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_log: {
        Row: {
          account_id: string
          action: string
          created_at: string
          detail: Json
          direction: string
          entity: string
          external_id: string | null
          id: number
          local_id: string | null
          provider: string
          run_id: string | null
        }
        Insert: {
          account_id: string
          action: string
          created_at?: string
          detail?: Json
          direction: string
          entity: string
          external_id?: string | null
          id?: number
          local_id?: string | null
          provider: string
          run_id?: string | null
        }
        Update: {
          account_id?: string
          action?: string
          created_at?: string
          detail?: Json
          direction?: string
          entity?: string
          external_id?: string | null
          id?: number
          local_id?: string | null
          provider?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_responses: {
        Row: {
          account_id: string
          answered_at: string | null
          channel: string | null
          comment: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          score: number | null
          sent_at: string
          ticket_id: string | null
          token: string
        }
        Insert: {
          account_id: string
          answered_at?: string | null
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          sent_at?: string
          ticket_id?: string | null
          token?: string
        }
        Update: {
          account_id?: string
          answered_at?: string | null
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          sent_at?: string
          ticket_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "csat_responses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "csat_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_responses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          account_id: string
          archived: boolean
          created_at: string
          entity: string
          help: string | null
          id: string
          key: string
          label: string
          options: Json
          position: number
          required: boolean
          required_stage_id: string | null
          type: string
        }
        Insert: {
          account_id: string
          archived?: boolean
          created_at?: string
          entity: string
          help?: string | null
          id?: string
          key: string
          label: string
          options?: Json
          position?: number
          required?: boolean
          required_stage_id?: string | null
          type: string
        }
        Update: {
          account_id?: string
          archived?: boolean
          created_at?: string
          entity?: string
          help?: string | null
          id?: string
          key?: string
          label?: string
          options?: Json
          position?: number
          required?: boolean
          required_stage_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_fields_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contacts: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          deal_id: string
          id: string
          role: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          id?: string
          role?: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_forecast_suggestions: {
        Row: {
          account_id: string
          created_at: string
          current_category: string
          deal_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          meeting_id: string | null
          reasons: string[]
          status: string
          suggested_category: string
        }
        Insert: {
          account_id: string
          created_at?: string
          current_category: string
          deal_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id?: string | null
          reasons?: string[]
          status?: string
          suggested_category: string
        }
        Update: {
          account_id?: string
          created_at?: string
          current_category?: string
          deal_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id?: string | null
          reasons?: string[]
          status?: string
          suggested_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_forecast_suggestions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_forecast_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_forecast_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_items: {
        Row: {
          account_id: string
          billing: string
          created_at: string
          deal_id: string
          discount_pct: number
          id: string
          kind: string
          line_total: number | null
          name: string
          position: number
          product_id: string | null
          quantity: number
          reason: string | null
          source: string
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          account_id: string
          billing?: string
          created_at?: string
          deal_id: string
          discount_pct?: number
          id?: string
          kind?: string
          line_total?: number | null
          name: string
          position?: number
          product_id?: string | null
          quantity?: number
          reason?: string | null
          source?: string
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          billing?: string
          created_at?: string
          deal_id?: string
          discount_pct?: number
          id?: string
          kind?: string
          line_total?: number | null
          name?: string
          position?: number
          product_id?: string | null
          quantity?: number
          reason?: string | null
          source?: string
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          account_id: string
          closed_at: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          custom: Json
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          owner_user_id: string | null
          pipeline_id: string
          position: number
          potential_value: number
          source: string | null
          stage_id: string
          status: string
          title: string
          updated_at: string
          value: number
          value_source: string
        }
        Insert: {
          account_id: string
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          custom?: Json
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          owner_user_id?: string | null
          pipeline_id: string
          position?: number
          potential_value?: number
          source?: string | null
          stage_id: string
          status?: string
          title: string
          updated_at?: string
          value?: number
          value_source?: string
        }
        Update: {
          account_id?: string
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          custom?: Json
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          owner_user_id?: string | null
          pipeline_id?: string
          position?: number
          potential_value?: number
          source?: string | null
          stage_id?: string
          status?: string
          title?: string
          updated_at?: string
          value?: number
          value_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      dialer_sessions: {
        Row: {
          account_id: string
          contact_ids: string[]
          created_at: string
          id: string
          mode: string
          name: string | null
          position: number
          segment_id: string | null
          stats: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          contact_ids?: string[]
          created_at?: string
          id?: string
          mode?: string
          name?: string | null
          position?: number
          segment_id?: string | null
          stats?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          contact_ids?: string[]
          created_at?: string
          id?: string
          mode?: string
          name?: string | null
          position?: number
          segment_id?: string | null
          stats?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialer_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialer_sessions_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          account_id: string
          claimed_until: string | null
          created_at: string
          dispatched_at: string | null
          entity: string
          entity_id: string | null
          id: number
          payload: Json
          type: string
        }
        Insert: {
          account_id: string
          claimed_until?: string | null
          created_at?: string
          dispatched_at?: string | null
          entity: string
          entity_id?: string | null
          id?: number
          payload?: Json
          type: string
        }
        Update: {
          account_id?: string
          claimed_until?: string | null
          created_at?: string
          dispatched_at?: string | null
          entity?: string
          entity_id?: string | null
          id?: number
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          account_id: string
          audience_estimate: number | null
          batch_size: number
          blocks: Json
          created_at: string
          created_by: string | null
          finished_at: string | null
          html: string
          id: string
          last_error: string | null
          name: string
          preheader: string | null
          scheduled_at: string | null
          segment_filter: Json | null
          segment_id: string | null
          started_at: string | null
          status: string
          subject: string
          template_id: string | null
          test_sent_to: string | null
          tested_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          audience_estimate?: number | null
          batch_size?: number
          blocks?: Json
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          html?: string
          id?: string
          last_error?: string | null
          name: string
          preheader?: string | null
          scheduled_at?: string | null
          segment_filter?: Json | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          test_sent_to?: string | null
          tested_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          audience_estimate?: number | null
          batch_size?: number
          blocks?: Json
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          html?: string
          id?: string
          last_error?: string | null
          name?: string
          preheader?: string | null
          scheduled_at?: string | null
          segment_filter?: Json | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          test_sent_to?: string | null
          tested_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_domains: {
        Row: {
          account_id: string
          checked_at: string | null
          created_at: string
          domain: string
          id: string
          records: Json
          status: string
          warmup_started_at: string | null
        }
        Insert: {
          account_id: string
          checked_at?: string | null
          created_at?: string
          domain: string
          id?: string
          records?: Json
          status?: string
          warmup_started_at?: string | null
        }
        Update: {
          account_id?: string
          checked_at?: string | null
          created_at?: string
          domain?: string
          id?: string
          records?: Json
          status?: string
          warmup_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          account_id: string
          created_at: string
          cta: string | null
          email_message_id: string | null
          id: number
          ip_hash: string | null
          type: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          cta?: string | null
          email_message_id?: string | null
          id?: number
          ip_hash?: string | null
          type: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          cta?: string | null
          email_message_id?: string | null
          id?: number
          ip_hash?: string | null
          type?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          account_id: string
          automation_run_id: string | null
          bounced_at: string | null
          campaign_id: string | null
          category: string
          click_count: number
          clicked_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          deal_id: string | null
          delivered_at: string | null
          error: string | null
          first_cta: string | null
          id: string
          kind: string
          links: string[]
          open_count: number
          opened_at: string | null
          preview: string | null
          provider_id: string | null
          sent_at: string | null
          skip_reason: string | null
          status: string
          subject: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          automation_run_id?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          category?: string
          click_count?: number
          clicked_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          delivered_at?: string | null
          error?: string | null
          first_cta?: string | null
          id?: string
          kind: string
          links?: string[]
          open_count?: number
          opened_at?: string | null
          preview?: string | null
          provider_id?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subject?: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          automation_run_id?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          category?: string
          click_count?: number
          clicked_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          delivered_at?: string | null
          error?: string | null
          first_cta?: string | null
          id?: string
          kind?: string
          links?: string[]
          open_count?: number
          opened_at?: string | null
          preview?: string | null
          provider_id?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          account_id: string
          blocks: Json
          category: string
          created_at: string
          created_by: string | null
          html: string
          id: string
          name: string
          preheader: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          account_id: string
          blocks?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          html?: string
          id?: string
          name: string
          preheader?: string | null
          subject?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          blocks?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          html?: string
          id?: string
          name?: string
          preheader?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          account_id: string
          all_day: boolean
          color: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          ends_at: string
          id: string
          location: string | null
          meeting_url: string | null
          owner_user_id: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          all_day?: boolean
          color?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          ends_at: string
          id?: string
          location?: string | null
          meeting_url?: string | null
          owner_user_id?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          all_day?: boolean
          color?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          location?: string | null
          meeting_url?: string | null
          owner_user_id?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      external_links: {
        Row: {
          account_id: string
          created_at: string
          entity: string
          external_id: string
          id: string
          local_id: string
          local_synced_at: string | null
          provider: string
          remote_updated_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          entity: string
          external_id: string
          id?: string
          local_id: string
          local_synced_at?: string | null
          provider: string
          remote_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          entity?: string
          external_id?: string
          id?: string
          local_id?: string
          local_synced_at?: string | null
          provider?: string
          remote_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_snapshots: {
        Row: {
          account_id: string
          best_case: number
          commit_value: number
          deals: number
          id: number
          month: string
          pipeline: number
          taken_on: string
          user_id: string | null
          weighted: number
        }
        Insert: {
          account_id: string
          best_case?: number
          commit_value?: number
          deals?: number
          id?: number
          month: string
          pipeline?: number
          taken_on?: string
          user_id?: string | null
          weighted?: number
        }
        Update: {
          account_id?: string
          best_case?: number
          commit_value?: number
          deals?: number
          id?: number
          month?: string
          pipeline?: number
          taken_on?: string
          user_id?: string | null
          weighted?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          account_id: string
          confirm_token: string | null
          confirm_token_hash: string | null
          confirmed_at: string | null
          contact_id: string | null
          created_at: string
          external_id: string | null
          form_id: string | null
          id: string
          ip_hash: string | null
          page_url: string | null
          payload: Json
          pending_email_consent: Json | null
          processed_at: string | null
          referrer: string | null
          source: string
          suspect: boolean
          user_agent: string | null
          utm: Json
          visitor_id: string | null
        }
        Insert: {
          account_id: string
          confirm_token?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          form_id?: string | null
          id?: string
          ip_hash?: string | null
          page_url?: string | null
          payload?: Json
          pending_email_consent?: Json | null
          processed_at?: string | null
          referrer?: string | null
          source?: string
          suspect?: boolean
          user_agent?: string | null
          utm?: Json
          visitor_id?: string | null
        }
        Update: {
          account_id?: string
          confirm_token?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          form_id?: string | null
          id?: string
          ip_hash?: string | null
          page_url?: string | null
          payload?: Json
          pending_email_consent?: Json | null
          processed_at?: string | null
          referrer?: string | null
          source?: string
          suspect?: boolean
          user_agent?: string | null
          utm?: Json
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          account_id: string
          consent: Json
          created_at: string
          created_by: string | null
          description: string | null
          destination: Json
          fields: Json
          id: string
          name: string
          redirect_url: string | null
          rr_cursor: number
          status: string
          submissions_count: number
          submit_label: string
          success_message: string
          theme: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          consent?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: Json
          fields?: Json
          id?: string
          name: string
          redirect_url?: string | null
          rr_cursor?: number
          status?: string
          submissions_count?: number
          submit_label?: string
          success_message?: string
          theme?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          consent?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: Json
          fields?: Json
          id?: string
          name?: string
          redirect_url?: string | null
          rr_cursor?: number
          status?: string
          submissions_count?: number
          submit_label?: string
          success_message?: string
          theme?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          metric: string
          period: string
          target: number
          user_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric: string
          period: string
          target: number
          user_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          period?: string
          target?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          error: string | null
          file_name: string | null
          finished_at: string | null
          id: string
          mapping: Json
          report: Json
          source: string
          status: string
          totals: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          mapping?: Json
          report?: Json
          source: string
          status?: string
          totals?: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          mapping?: Json
          report?: Json
          source?: string
          status?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_events: {
        Row: {
          channel_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          external_id: string | null
          id: number
          payload: Json
          provider: string
          status: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: never
          payload: Json
          provider: string
          status?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: never
          payload?: Json
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_views: {
        Row: {
          account_id: string
          created_at: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_updates: {
        Row: {
          account_id: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          incident_id: string
          is_public: boolean
          notified: number
          status: string
        }
        Insert: {
          account_id: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          incident_id: string
          is_public?: boolean
          notified?: number
          status: string
        }
        Update: {
          account_id?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          incident_id?: string
          is_public?: boolean
          notified?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_updates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          impact: string
          is_public: boolean
          public_summary: string | null
          resolved_at: string | null
          started_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          is_public?: boolean
          public_summary?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          is_public?: boolean
          public_summary?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          account_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          account_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          account_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ivr_menus: {
        Row: {
          account_id: string
          created_at: string
          greeting: string
          id: string
          is_active: boolean
          name: string
          phone_number_id: string | null
          tree: Json
          updated_at: string
          zadarma_ivr_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          greeting?: string
          id?: string
          is_active?: boolean
          name: string
          phone_number_id?: string | null
          tree?: Json
          updated_at?: string
          zadarma_ivr_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          greeting?: string
          id?: string
          is_active?: boolean
          name?: string
          phone_number_id?: string | null
          tree?: Json
          updated_at?: string
          zadarma_ivr_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ivr_menus_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ivr_menus_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          account_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_at: string
          status: string
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_at?: string
          status?: string
        }
        Update: {
          account_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          account_id: string
          ai_suggested: boolean
          author_user_id: string | null
          body_md: string
          category: string | null
          chunk_count: number
          created_at: string
          document_id: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_model: string | null
          helpful_no: number
          helpful_yes: number
          id: string
          search: unknown
          slug: string
          source_ticket_id: string | null
          status: string
          title: string
          updated_at: string
          views: number
          visibility: string
        }
        Insert: {
          account_id: string
          ai_suggested?: boolean
          author_user_id?: string | null
          body_md?: string
          category?: string | null
          chunk_count?: number
          created_at?: string
          document_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          helpful_no?: number
          helpful_yes?: number
          id?: string
          search?: unknown
          slug: string
          source_ticket_id?: string | null
          status?: string
          title: string
          updated_at?: string
          views?: number
          visibility?: string
        }
        Update: {
          account_id?: string
          ai_suggested?: boolean
          author_user_id?: string | null
          body_md?: string
          category?: string | null
          chunk_count?: number
          created_at?: string
          document_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          helpful_no?: number
          helpful_yes?: number
          id?: string
          search?: unknown
          slug?: string
          source_ticket_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          views?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          account_id: string
          article_id: string
          content: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          id: string
          idx: number
          search: unknown
        }
        Insert: {
          account_id: string
          article_id: string
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          idx: number
          search?: unknown
        }
        Update: {
          account_id?: string
          article_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          idx?: number
          search?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "kb_chunks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_chunks_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          account_id: string
          chars: number
          chunks: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          mime: string | null
          name: string
          size_bytes: number | null
          source: string
          source_ref: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          chars?: number
          chunks?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          mime?: string | null
          name: string
          size_bytes?: number | null
          source: string
          source_ref?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          chars?: number
          chunks?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          mime?: string | null
          name?: string
          size_bytes?: number | null
          source?: string
          source_ref?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          account_id: string
          blocks: Json
          created_at: string
          created_by: string | null
          description: string | null
          form_id: string | null
          id: string
          published: boolean
          slug: string
          theme: Json
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          account_id: string
          blocks?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_id?: string | null
          id?: string
          published?: boolean
          slug: string
          theme?: Json
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          account_id?: string
          blocks?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_id?: string | null
          id?: string
          published?: boolean
          slug?: string
          theme?: Json
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_routing_rules: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match: Json
          mode: string
          name: string
          position: number
          routed_count: number
          rr_cursor: number
          updated_at: string
          user_ids: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match?: Json
          mode?: string
          name: string
          position?: number
          routed_count?: number
          rr_cursor?: number
          updated_at?: string
          user_ids?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match?: Json
          mode?: string
          name?: string
          position?: number
          routed_count?: number
          rr_cursor?: number
          updated_at?: string
          user_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "lead_routing_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_models: {
        Row: {
          account_id: string
          metrics: Json
          positives: number
          samples: number
          trained_at: string
          weights: Json
        }
        Insert: {
          account_id: string
          metrics?: Json
          positives?: number
          samples?: number
          trained_at?: string
          weights?: Json
        }
        Update: {
          account_id?: string
          metrics?: Json
          positives?: number
          samples?: number
          trained_at?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_models_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          account_id: string
          best_dow: number | null
          best_hour: number | null
          contact_id: string
          factors: Json
          reply_samples: number
          score: number | null
          scored_at: string
        }
        Insert: {
          account_id: string
          best_dow?: number | null
          best_hour?: number | null
          contact_id: string
          factors?: Json
          reply_samples?: number
          score?: number | null
          scored_at?: string
        }
        Update: {
          account_id?: string
          best_dow?: number | null
          best_hour?: number | null
          contact_id?: string
          factors?: Json
          reply_samples?: number
          score?: number | null
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "lead_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          account_id: string | null
          created_at: string
          error: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string
          ok: boolean
          output_tokens: number | null
          provider: string
          purpose: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          ok: boolean
          output_tokens?: number | null
          provider: string
          purpose: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          error?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          ok?: boolean
          output_tokens?: number | null
          provider?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          scopes: string[]
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          scopes?: string[]
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          scopes?: string[]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_invites: {
        Row: {
          account_id: string
          address: string | null
          channel: string
          created_at: string
          error: string | null
          id: string
          job_id: string | null
          kind: string
          meeting_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          account_id: string
          address?: string | null
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          meeting_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          address?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          meeting_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_invites_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          account_id: string
          admitted: boolean
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          identity: string
          joined_at: string | null
          kind: string
          left_at: string | null
          meeting_id: string
          name: string | null
          token_expires_at: string | null
          token_hash: string | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          admitted?: boolean
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          identity: string
          joined_at?: string | null
          kind: string
          left_at?: string | null
          meeting_id: string
          name?: string | null
          token_expires_at?: string | null
          token_hash?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          admitted?: boolean
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          identity?: string
          joined_at?: string | null
          kind?: string
          left_at?: string | null
          meeting_id?: string
          name?: string | null
          token_expires_at?: string | null
          token_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "meeting_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_transcripts: {
        Row: {
          account_id: string
          created_at: string
          end_ms: number | null
          id: number
          is_seller: boolean
          meeting_id: string
          participant_identity: string | null
          speaker_label: string | null
          start_ms: number | null
          text: string
        }
        Insert: {
          account_id: string
          created_at?: string
          end_ms?: number | null
          id?: number
          is_seller?: boolean
          meeting_id: string
          participant_identity?: string | null
          speaker_label?: string | null
          start_ms?: number | null
          text: string
        }
        Update: {
          account_id?: string
          created_at?: string
          end_ms?: number | null
          id?: number
          is_seller?: boolean
          meeting_id?: string
          participant_identity?: string | null
          speaker_label?: string | null
          start_ms?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcripts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          account_id: string
          booking_answers: Json
          booking_page_id: string | null
          briefing: Json | null
          briefing_at: string | null
          cancel_reason: string | null
          canceled_by: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          egress_id: string | null
          ended_at: string | null
          event_id: string | null
          external_events: Json
          guest_confirmed_at: string | null
          host_user_id: string | null
          id: string
          minutes: Json | null
          playbook_id: string | null
          record: boolean
          recording_url: string | null
          require_admit: boolean
          reschedule_count: number
          room_name: string
          scheduled_end: string | null
          scheduled_start: string | null
          score: Json | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          booking_answers?: Json
          booking_page_id?: string | null
          briefing?: Json | null
          briefing_at?: string | null
          cancel_reason?: string | null
          canceled_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          egress_id?: string | null
          ended_at?: string | null
          event_id?: string | null
          external_events?: Json
          guest_confirmed_at?: string | null
          host_user_id?: string | null
          id?: string
          minutes?: Json | null
          playbook_id?: string | null
          record?: boolean
          recording_url?: string | null
          require_admit?: boolean
          reschedule_count?: number
          room_name: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          score?: Json | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          booking_answers?: Json
          booking_page_id?: string | null
          briefing?: Json | null
          briefing_at?: string | null
          cancel_reason?: string | null
          canceled_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          egress_id?: string | null
          ended_at?: string | null
          event_id?: string | null
          external_events?: Json
          guest_confirmed_at?: string | null
          host_user_id?: string | null
          id?: string
          minutes?: Json | null
          playbook_id?: string | null
          record?: boolean
          recording_url?: string | null
          require_admit?: boolean
          reschedule_count?: number
          room_name?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          score?: Json | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          account_id: string
          created_at: string
          display_name: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          account_id: string
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          external_id: string | null
          id: string
          is_private: boolean
          media_mime: string | null
          media_name: string | null
          media_url: string | null
          metadata: Json
          reply_to_external_id: string | null
          sender_handle: string | null
          sender_name: string | null
          sender_type: string
          sender_user_id: string | null
          status: string
          transcript: string | null
          type: string
        }
        Insert: {
          account_id: string
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_private?: boolean
          media_mime?: string | null
          media_name?: string | null
          media_url?: string | null
          metadata?: Json
          reply_to_external_id?: string | null
          sender_handle?: string | null
          sender_name?: string | null
          sender_type: string
          sender_user_id?: string | null
          status?: string
          transcript?: string | null
          type?: string
        }
        Update: {
          account_id?: string
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_private?: boolean
          media_mime?: string | null
          media_name?: string | null
          media_url?: string | null
          metadata?: Json
          reply_to_external_id?: string | null
          sender_handle?: string | null
          sender_name?: string | null
          sender_type?: string
          sender_user_id?: string | null
          status?: string
          transcript?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_questions: {
        Row: {
          account_id: string
          answer: string | null
          created_at: string
          id: string
          links: Json
          question: string
          used: Json
          user_id: string
        }
        Insert: {
          account_id: string
          answer?: string | null
          created_at?: string
          id?: string
          links?: Json
          question: string
          used?: Json
          user_id: string
        }
        Update: {
          account_id?: string
          answer?: string | null
          created_at?: string
          id?: string
          links?: Json
          question?: string
          used?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_questions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          account_id: string
          app: boolean
          email: boolean
          kind: string
          push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          app?: boolean
          email?: boolean
          kind: string
          push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          app?: boolean
          email?: boolean
          kind?: string
          push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          account_id: string
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          account_id: string
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          account_id?: string
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          account_id: string
          answered_at: string | null
          comment: string | null
          contact_id: string | null
          id: string
          score: number | null
          sent_at: string
          survey_id: string
          token: string
        }
        Insert: {
          account_id: string
          answered_at?: string | null
          comment?: string | null
          contact_id?: string | null
          id?: string
          score?: number | null
          sent_at?: string
          survey_id: string
          token?: string
        }
        Update: {
          account_id?: string
          answered_at?: string | null
          comment?: string | null
          contact_id?: string | null
          id?: string
          score?: number | null
          sent_at?: string
          survey_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_surveys: {
        Row: {
          account_id: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          question: string
          segment_id: string | null
          sent_at: string | null
          sent_count: number
          status: string
        }
        Insert: {
          account_id: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          question?: string
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
        }
        Update: {
          account_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          question?: string
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      page_visits: {
        Row: {
          account_id: string
          contact_id: string | null
          created_at: string
          id: number
          path: string | null
          referrer: string | null
          url: string
          utm: Json
          visitor_id: string
        }
        Insert: {
          account_id: string
          contact_id?: string | null
          created_at?: string
          id?: number
          path?: string | null
          referrer?: string | null
          url: string
          utm?: Json
          visitor_id: string
        }
        Update: {
          account_id?: string
          contact_id?: string | null
          created_at?: string
          id?: number
          path?: string | null
          referrer?: string | null
          url?: string
          utm?: Json
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_visits_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_visits_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "page_visits_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string
          amount: number
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_type: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          cycle: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_url: string | null
          kind: string
          paid_at: string | null
          pix_payload: string | null
          proposal_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_type?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          kind?: string
          paid_at?: string | null
          pix_payload?: string | null
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_type?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          kind?: string
          paid_at?: string | null
          pix_payload?: string | null
          proposal_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          account_id: string
          created_at: string
          elevenlabs_phone_id: string | null
          id: string
          is_active: boolean
          label: string | null
          number: string
          owner_user_id: string | null
          provider: string
          queue_id: string | null
          sip_id: string | null
          updated_at: string
          usage: string[]
          voice_agent_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          elevenlabs_phone_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          number: string
          owner_user_id?: string | null
          provider?: string
          queue_id?: string | null
          sip_id?: string | null
          updated_at?: string
          usage?: string[]
          voice_agent_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          elevenlabs_phone_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          number?: string
          owner_user_id?: string | null
          provider?: string
          queue_id?: string | null
          sip_id?: string | null
          updated_at?: string
          usage?: string[]
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "call_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          account_id: string
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          pipeline_id: string
          position: number
          probability: number
        }
        Insert: {
          account_id: string
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          pipeline_id: string
          position?: number
          probability?: number
        }
        Update: {
          account_id?: string
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          pipeline_id?: string
          position?: number
          probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_alerts: {
        Row: {
          details: Json
          id: string
          kind: string
          message: string
          notified_at: string | null
          opened_at: string
          resolved_at: string | null
          resolved_notified_at: string | null
          service: string
        }
        Insert: {
          details?: Json
          id?: string
          kind?: string
          message: string
          notified_at?: string | null
          opened_at?: string
          resolved_at?: string | null
          resolved_notified_at?: string | null
          service: string
        }
        Update: {
          details?: Json
          id?: string
          kind?: string
          message?: string
          notified_at?: string | null
          opened_at?: string
          resolved_at?: string | null
          resolved_notified_at?: string | null
          service?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: boolean
          multi_account: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          multi_account?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          multi_account?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      playbooks: {
        Row: {
          account_id: string
          closing_signals: Json
          competitors: Json
          created_at: string
          created_by: string | null
          description: string | null
          forbidden_phrases: Json
          framework: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          objections: Json
          phases: Json
          pipeline_id: string | null
          questions: Json
          scorecard_id: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          closing_signals?: Json
          competitors?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          forbidden_phrases?: Json
          framework?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          objections?: Json
          phases?: Json
          pipeline_id?: string | null
          questions?: Json
          scorecard_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          closing_signals?: Json
          competitors?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          forbidden_phrases?: Json
          framework?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          objections?: Json
          phases?: Json
          pipeline_id?: string | null
          questions?: Json
          scorecard_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_scorecard_fk"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "scorecard_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          account_id: string
          channel: string
          contact_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          channel: string
          contact_id: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          channel?: string
          contact_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "portal_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relations: {
        Row: {
          account_id: string
          created_at: string
          id: string
          kind: string
          pitch: string | null
          product_id: string
          related_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          kind: string
          pitch?: string | null
          product_id: string
          related_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          kind?: string
          pitch?: string | null
          product_id?: string
          related_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_id_fkey"
            columns: ["related_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_wishes: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          importance: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          importance?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          importance?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_wishes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          account_id: string
          active: boolean
          billing: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          keywords: string[]
          kind: string
          name: string
          position: number
          price: number
          updated_at: string
        }
        Insert: {
          account_id: string
          active?: boolean
          billing?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[]
          kind?: string
          name: string
          position?: number
          price?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          billing?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[]
          kind?: string
          name?: string
          position?: number
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          last_account_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          last_account_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          last_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_views: {
        Row: {
          account_id: string
          id: number
          ip_hash: string | null
          proposal_id: string
          seconds: number
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          account_id: string
          id?: number
          ip_hash?: string | null
          proposal_id: string
          seconds?: number
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          account_id?: string
          id?: number
          ip_hash?: string | null
          proposal_id?: string
          seconds?: number
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_views_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          accepted_document: string | null
          accepted_ip: string | null
          accepted_name: string | null
          accepted_user_agent: string | null
          account_id: string
          company_id: string | null
          conditions: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          declined_reason: string | null
          discount_total: number
          first_viewed_at: string | null
          id: string
          items: Json
          last_viewed_at: string | null
          monthly_total: number
          notes: string | null
          number: number
          one_time_total: number
          parent_id: string | null
          sent_at: string | null
          signature_doc_id: string | null
          signature_provider: string | null
          signature_sent_at: string | null
          signature_status: string | null
          signature_url: string | null
          signed_at: string | null
          signed_file_url: string | null
          status: string
          title: string
          token: string
          total: number
          updated_at: string
          valid_until: string | null
          version: number
          view_count: number
          yearly_total: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_document?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          accepted_user_agent?: string | null
          account_id: string
          company_id?: string | null
          conditions?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          declined_reason?: string | null
          discount_total?: number
          first_viewed_at?: string | null
          id?: string
          items?: Json
          last_viewed_at?: string | null
          monthly_total?: number
          notes?: string | null
          number: number
          one_time_total?: number
          parent_id?: string | null
          sent_at?: string | null
          signature_doc_id?: string | null
          signature_provider?: string | null
          signature_sent_at?: string | null
          signature_status?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          status?: string
          title: string
          token?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          view_count?: number
          yearly_total?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_document?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          accepted_user_agent?: string | null
          account_id?: string
          company_id?: string | null
          conditions?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          declined_reason?: string | null
          discount_total?: number
          first_viewed_at?: string | null
          id?: string
          items?: Json
          last_viewed_at?: string | null
          monthly_total?: number
          notes?: string | null
          number?: number
          one_time_total?: number
          parent_id?: string | null
          sent_at?: string | null
          signature_doc_id?: string | null
          signature_provider?: string | null
          signature_sent_at?: string | null
          signature_status?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          status?: string
          title?: string
          token?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          view_count?: number
          yearly_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          fail_count: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quality_calibrations: {
        Row: {
          account_id: string
          agreement: number | null
          created_at: string
          evaluation_id: string
          id: string
          items: Json
          notes: string | null
          reviewer_user_id: string
          score: number | null
        }
        Insert: {
          account_id: string
          agreement?: number | null
          created_at?: string
          evaluation_id: string
          id?: string
          items?: Json
          notes?: string | null
          reviewer_user_id: string
          score?: number | null
        }
        Update: {
          account_id?: string
          agreement?: number | null
          created_at?: string
          evaluation_id?: string
          id?: string
          items?: Json
          notes?: string | null
          reviewer_user_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_calibrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_calibrations_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "quality_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_disputes: {
        Row: {
          account_id: string
          agent_user_id: string
          created_at: string
          criterion_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          evaluation_id: string
          id: string
          new_score: number | null
          reason: string
          status: string
        }
        Insert: {
          account_id: string
          agent_user_id: string
          created_at?: string
          criterion_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evaluation_id: string
          id?: string
          new_score?: number | null
          reason: string
          status?: string
        }
        Update: {
          account_id?: string
          agent_user_id?: string
          created_at?: string
          criterion_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evaluation_id?: string
          id?: string
          new_score?: number | null
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_disputes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_disputes_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "quality_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_evaluations: {
        Row: {
          account_id: string
          agent_user_id: string | null
          ai_score: number | null
          channel: string
          contact_id: string | null
          cost_usd: number
          created_at: string
          eliminated: boolean
          error: string | null
          form_id: string | null
          form_name: string | null
          id: string
          interaction_end: string
          interaction_start: string | null
          is_ai: boolean
          items: Json
          model: string | null
          revised: boolean
          score: number | null
          source: string
          source_id: string
          status: string
          summary: string | null
        }
        Insert: {
          account_id: string
          agent_user_id?: string | null
          ai_score?: number | null
          channel: string
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          eliminated?: boolean
          error?: string | null
          form_id?: string | null
          form_name?: string | null
          id?: string
          interaction_end: string
          interaction_start?: string | null
          is_ai?: boolean
          items?: Json
          model?: string | null
          revised?: boolean
          score?: number | null
          source: string
          source_id: string
          status?: string
          summary?: string | null
        }
        Update: {
          account_id?: string
          agent_user_id?: string | null
          ai_score?: number | null
          channel?: string
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          eliminated?: boolean
          error?: string | null
          form_id?: string | null
          form_name?: string | null
          id?: string
          interaction_end?: string
          interaction_start?: string | null
          is_ai?: boolean
          items?: Json
          model?: string | null
          revised?: boolean
          score?: number | null
          source?: string
          source_id?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_evaluations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_evaluations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "quality_evaluations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_evaluations_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "quality_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_forms: {
        Row: {
          account_id: string
          channels: string[]
          created_at: string
          created_by: string | null
          criteria: Json
          description: string | null
          id: string
          include_ai: boolean
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          include_ai?: boolean
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          include_ai?: boolean
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_forms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_settings: {
        Row: {
          account_id: string
          daily_max: number
          enabled: boolean
          idle_hours: number
          include_ai: boolean
          min_messages: number
          model_anthropic: string
          model_openai: string
          monthly_budget_usd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          daily_max?: number
          enabled?: boolean
          idle_hours?: number
          include_ai?: boolean
          min_messages?: number
          model_anthropic?: string
          model_openai?: string
          monthly_budget_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          daily_max?: number
          enabled?: boolean
          idle_hours?: number
          include_ai?: boolean
          min_messages?: number
          model_anthropic?: string
          model_openai?: string
          monthly_budget_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_agents: {
        Row: {
          account_id: string
          cap_chat: number
          cap_email: number
          cap_task: number
          cap_voice: number
          created_at: string
          is_active: boolean
          user_id: string
          wrap_up_seconds: number
        }
        Insert: {
          account_id: string
          cap_chat?: number
          cap_email?: number
          cap_task?: number
          cap_voice?: number
          created_at?: string
          is_active?: boolean
          user_id: string
          wrap_up_seconds?: number
        }
        Update: {
          account_id?: string
          cap_chat?: number
          cap_email?: number
          cap_task?: number
          cap_voice?: number
          created_at?: string
          is_active?: boolean
          user_id?: string
          wrap_up_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "queue_agents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_members: {
        Row: {
          account_id: string
          is_active: boolean
          priority: number
          queue_id: string
          skills: string[]
          user_id: string
        }
        Insert: {
          account_id: string
          is_active?: boolean
          priority?: number
          queue_id: string
          skills?: string[]
          user_id: string
        }
        Update: {
          account_id?: string
          is_active?: boolean
          priority?: number
          queue_id?: string
          skills?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_members_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "call_queues"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          account_id: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          intents: string[]
          is_shared: boolean
          shortcut: string
          title: string
          use_count: number
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          intents?: string[]
          is_shared?: boolean
          shortcut: string
          title: string
          use_count?: number
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          intents?: string[]
          is_shared?: boolean
          shortcut?: string
          title?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      roleplay_personas: {
        Row: {
          account_id: string
          company: string | null
          created_at: string
          created_by: string | null
          difficulty: string
          id: string
          is_active: boolean
          name: string
          objections: string[]
          playbook_id: string | null
          profile: string
          role: string | null
        }
        Insert: {
          account_id: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          name: string
          objections?: string[]
          playbook_id?: string | null
          profile?: string
          role?: string | null
        }
        Update: {
          account_id?: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          name?: string
          objections?: string[]
          playbook_id?: string | null
          profile?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_personas_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_personas_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_sessions: {
        Row: {
          account_id: string
          covered: string[]
          created_at: string
          criteria: Json
          feedback: string | null
          finished_at: string | null
          id: string
          improvements: string[]
          messages: Json
          persona_id: string | null
          playbook_id: string | null
          score: number | null
          scorecard_id: string | null
          status: string
          strengths: string[]
          user_id: string
        }
        Insert: {
          account_id: string
          covered?: string[]
          created_at?: string
          criteria?: Json
          feedback?: string | null
          finished_at?: string | null
          id?: string
          improvements?: string[]
          messages?: Json
          persona_id?: string | null
          playbook_id?: string | null
          score?: number | null
          scorecard_id?: string | null
          status?: string
          strengths?: string[]
          user_id: string
        }
        Update: {
          account_id?: string
          covered?: string[]
          created_at?: string
          criteria?: Json
          feedback?: string | null
          finished_at?: string | null
          id?: string
          improvements?: string[]
          messages?: Json
          persona_id?: string | null
          playbook_id?: string | null
          score?: number | null
          scorecard_id?: string | null
          status?: string
          strengths?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "roleplay_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_sessions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_sessions_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "scorecard_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          account_id: string
          chart: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean
          last_sent_at: string | null
          name: string
          recipients: string[]
          schedule: string
          updated_at: string
        }
        Insert: {
          account_id: string
          chart?: string
          config: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          last_sent_at?: string | null
          name: string
          recipients?: string[]
          schedule?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          chart?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          last_sent_at?: string | null
          name?: string
          recipients?: string[]
          schedule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_templates: {
        Row: {
          account_id: string
          created_at: string
          criteria: Json
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          criteria?: Json
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          criteria?: Json
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          entity: string
          filter: Json
          id: string
          is_shared: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          entity?: string
          filter?: Json
          id?: string
          is_shared?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          entity?: string
          filter?: Json
          id?: string
          is_shared?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_heartbeats: {
        Row: {
          instance: string
          last_seen: string
          meta: Json
          service: string
        }
        Insert: {
          instance?: string
          last_seen?: string
          meta?: Json
          service: string
        }
        Update: {
          instance?: string
          last_seen?: string
          meta?: Json
          service?: string
        }
        Relationships: []
      }
      setup_facts: {
        Row: {
          account_id: string
          category: string
          created_at: string
          id: string
          key: string
          label: string
          source: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          account_id: string
          category?: string
          created_at?: string
          id?: string
          key: string
          label: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          account_id?: string
          category?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_facts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_messages: {
        Row: {
          account_id: string
          actions: Json
          content: string
          created_at: string
          id: string
          parts: Json
          role: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          actions?: Json
          content?: string
          created_at?: string
          id?: string
          parts?: Json
          role: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          actions?: Json
          content?: string
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setup_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_plan_rules: {
        Row: {
          account_id: string
          applies_to: string
          business_hours: boolean
          created_at: string
          id: string
          is_active: boolean
          match_field: string | null
          match_kind: string
          match_value: string
          name: string
          position: number
          targets: Json
        }
        Insert: {
          account_id: string
          applies_to?: string
          business_hours?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          match_field?: string | null
          match_kind?: string
          match_value: string
          name: string
          position?: number
          targets?: Json
        }
        Update: {
          account_id?: string
          applies_to?: string
          business_hours?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          match_field?: string | null
          match_kind?: string
          match_value?: string
          name?: string
          position?: number
          targets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sla_plan_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          account_id: string
          business_hours: boolean
          created_at: string
          first_response_minutes: number
          id: string
          priority: string
          resolution_minutes: number
        }
        Insert: {
          account_id: string
          business_hours?: boolean
          created_at?: string
          first_response_minutes: number
          id?: string
          priority: string
          resolution_minutes: number
        }
        Update: {
          account_id?: string
          business_hours?: boolean
          created_at?: string
          first_response_minutes?: number
          id?: string
          priority?: string
          resolution_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_flags: {
        Row: {
          account_id: string
          assigned_user_id: string | null
          conversation_id: string
          created_at: string
          detail: string
          evidence: string | null
          id: string
          kind: string
          notified_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          account_id: string
          assigned_user_id?: string | null
          conversation_id: string
          created_at?: string
          detail?: string
          evidence?: string | null
          id?: string
          kind: string
          notified_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          assigned_user_id?: string | null
          conversation_id?: string
          created_at?: string
          detail?: string
          evidence?: string | null
          id?: string
          kind?: string
          notified_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_flags_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_flags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          account_id: string
          address: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
          source: string | null
        }
        Insert: {
          account_id: string
          address: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          source?: string | null
        }
        Update: {
          account_id?: string
          address?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_extensions: {
        Row: {
          account_id: string
          created_at: string
          extension: string
          id: string
          is_active: boolean
          mobile: string | null
          sip_login: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          extension: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          sip_login?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          extension?: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          sip_login?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telephony_extensions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_counters: {
        Row: {
          account_id: string
          last_number: number
        }
        Insert: {
          account_id: string
          last_number?: number
        }
        Update: {
          account_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_counters_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          account_id: string
          author_user_id: string | null
          body: string | null
          created_at: string
          id: string
          is_public: boolean
          kind: string
          meta: Json
          ticket_id: string
        }
        Insert: {
          account_id: string
          author_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kind: string
          meta?: Json
          ticket_id: string
        }
        Update: {
          account_id?: string
          author_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kind?: string
          meta?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          account_id: string
          category: string | null
          closed_at: string | null
          company_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          csat_score: number | null
          custom: Json
          deal_id: string | null
          description: string | null
          first_response_at: string | null
          first_response_due_at: string | null
          id: string
          incident_id: string | null
          kb_article_id: string | null
          number: number
          order_ref: string | null
          owner_user_id: string | null
          parent_ticket_id: string | null
          priority: string
          resolution_due_at: string | null
          resolved_at: string | null
          sla_breached: boolean
          sla_plan_rule_id: string | null
          sla_policy_id: string | null
          sla_warned_at: string | null
          source: string
          status: string
          subject: string
          tags: string[]
          team: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          category?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          csat_score?: number | null
          custom?: Json
          deal_id?: string | null
          description?: string | null
          first_response_at?: string | null
          first_response_due_at?: string | null
          id?: string
          incident_id?: string | null
          kb_article_id?: string | null
          number: number
          order_ref?: string | null
          owner_user_id?: string | null
          parent_ticket_id?: string | null
          priority?: string
          resolution_due_at?: string | null
          resolved_at?: string | null
          sla_breached?: boolean
          sla_plan_rule_id?: string | null
          sla_policy_id?: string | null
          sla_warned_at?: string | null
          source?: string
          status?: string
          subject: string
          tags?: string[]
          team?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          category?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          csat_score?: number | null
          custom?: Json
          deal_id?: string | null
          description?: string | null
          first_response_at?: string | null
          first_response_due_at?: string | null
          id?: string
          incident_id?: string | null
          kb_article_id?: string | null
          number?: number
          order_ref?: string | null
          owner_user_id?: string | null
          parent_ticket_id?: string | null
          priority?: string
          resolution_due_at?: string | null
          resolved_at?: string | null
          sla_breached?: boolean
          sla_plan_rule_id?: string | null
          sla_policy_id?: string | null
          sla_warned_at?: string | null
          source?: string
          status?: string
          subject?: string
          tags?: string[]
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_kb_article_id_fkey"
            columns: ["kb_article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_parent_ticket_id_fkey"
            columns: ["parent_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sla_plan_rule_id_fkey"
            columns: ["sla_plan_rule_id"]
            isOneToOne: false
            referencedRelation: "sla_plan_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_terms: {
        Row: {
          account_id: string
          alert: boolean
          category: string
          created_at: string
          created_by: string | null
          id: string
          term: string
        }
        Insert: {
          account_id: string
          alert?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          term: string
        }
        Update: {
          account_id?: string
          alert?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_terms_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          account_id: string
          cost_usd: number
          created_at: string
          id: number
          kind: string
          meta: Json
          quantity: number
          ref_id: string | null
          ref_table: string | null
          unit: string
        }
        Insert: {
          account_id: string
          cost_usd?: number
          created_at?: string
          id?: number
          kind: string
          meta?: Json
          quantity?: number
          ref_id?: string | null
          ref_table?: string | null
          unit?: string
        }
        Update: {
          account_id?: string
          cost_usd?: number
          created_at?: string
          id?: number
          kind?: string
          meta?: Json
          quantity?: number
          ref_id?: string | null
          ref_table?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          elevenlabs_agent_id: string | null
          first_message: string | null
          id: string
          knowledge: string | null
          language: string
          last_sync_error: string | null
          model_id: string
          name: string
          objective: string | null
          phone_number_id: string | null
          prompt: string
          purpose: string
          status: string
          sync_diff: Json
          synced_at: string | null
          tools: string[]
          transfer_number: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          elevenlabs_agent_id?: string | null
          first_message?: string | null
          id?: string
          knowledge?: string | null
          language?: string
          last_sync_error?: string | null
          model_id?: string
          name: string
          objective?: string | null
          phone_number_id?: string | null
          prompt?: string
          purpose?: string
          status?: string
          sync_diff?: Json
          synced_at?: string | null
          tools?: string[]
          transfer_number?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          elevenlabs_agent_id?: string | null
          first_message?: string | null
          id?: string
          knowledge?: string | null
          language?: string
          last_sync_error?: string | null
          model_id?: string
          name?: string
          objective?: string | null
          phone_number_id?: string | null
          prompt?: string
          purpose?: string
          status?: string
          sync_diff?: Json
          synced_at?: string | null
          tools?: string[]
          transfer_number?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agents_phone_fk"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaign_targets: {
        Row: {
          account_id: string
          attempts: number
          call_id: string | null
          campaign_id: string
          contact_id: string
          created_at: string
          id: string
          last_attempt_at: string | null
          next_attempt_at: string
          phone: string
          result: string | null
          status: string
        }
        Insert: {
          account_id: string
          attempts?: number
          call_id?: string | null
          campaign_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          phone: string
          result?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          attempts?: number
          call_id?: string | null
          campaign_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          phone?: string
          result?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaign_targets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_call_fk"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "voice_campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaigns: {
        Row: {
          account_id: string
          context: Json
          created_at: string
          created_by: string | null
          days: number[]
          dial_prefix: string | null
          el_batch_id: string | null
          id: string
          max_attempts: number
          max_concurrency: number
          name: string
          phone_number_id: string | null
          retry_minutes: number
          segment_id: string | null
          starts_at: string | null
          stats: Json
          status: string
          timezone: string
          updated_at: string
          use_batch: boolean
          voice_agent_id: string | null
          window_end: string
          window_start: string
        }
        Insert: {
          account_id: string
          context?: Json
          created_at?: string
          created_by?: string | null
          days?: number[]
          dial_prefix?: string | null
          el_batch_id?: string | null
          id?: string
          max_attempts?: number
          max_concurrency?: number
          name: string
          phone_number_id?: string | null
          retry_minutes?: number
          segment_id?: string | null
          starts_at?: string | null
          stats?: Json
          status?: string
          timezone?: string
          updated_at?: string
          use_batch?: boolean
          voice_agent_id?: string | null
          window_end?: string
          window_start?: string
        }
        Update: {
          account_id?: string
          context?: Json
          created_at?: string
          created_by?: string | null
          days?: number[]
          dial_prefix?: string | null
          el_batch_id?: string | null
          id?: string
          max_attempts?: number
          max_concurrency?: number
          name?: string
          phone_number_id?: string | null
          retry_minutes?: number
          segment_id?: string | null
          starts_at?: string | null
          stats?: Json
          status?: string
          timezone?: string
          updated_at?: string
          use_batch?: boolean
          voice_agent_id?: string | null
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_campaigns_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_sessions: {
        Row: {
          account_id: string
          channel_id: string
          contact_id: string
          conversation_id: string
          created_at: string
          id: string
          last_seen_at: string
          token_hash: string
          visitor_id: string | null
        }
        Insert: {
          account_id: string
          channel_id: string
          contact_id: string
          conversation_id: string
          created_at?: string
          id?: string
          last_seen_at?: string
          token_hash: string
          visitor_id?: string | null
        }
        Update: {
          account_id?: string
          channel_id?: string
          contact_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          token_hash?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_sessions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "webchat_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          account_id: string
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_id: number | null
          event_type: string
          id: string
          next_attempt_at: string
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_id?: number | null
          event_type: string
          id?: string
          next_attempt_at?: string
          payload: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_id?: number | null
          event_type?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          description: string | null
          events: string[]
          id: string
          is_active: boolean
          url: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          url: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaign_targets: {
        Row: {
          account_id: string
          campaign_id: string
          contact_id: string
          id: string
          message_id: string | null
          next_attempt_at: string
          reason: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          account_id: string
          campaign_id: string
          contact_id: string
          id?: string
          message_id?: string | null
          next_attempt_at?: string
          reason?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          campaign_id?: string
          contact_id?: string
          id?: string
          message_id?: string | null
          next_attempt_at?: string
          reason?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_targets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_targets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          account_id: string
          audience_tags: string[]
          channel_id: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          launched_at: string | null
          name: string
          scheduled_at: string | null
          status: string
          template_language: string
          template_name: string
          template_params: string[]
        }
        Insert: {
          account_id: string
          audience_tags?: string[]
          channel_id: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          launched_at?: string | null
          name: string
          scheduled_at?: string | null
          status?: string
          template_language: string
          template_name: string
          template_params?: string[]
        }
        Update: {
          account_id?: string
          audience_tags?: string[]
          channel_id?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          launched_at?: string | null
          name?: string
          scheduled_at?: string | null
          status?: string
          template_language?: string
          template_name?: string
          template_params?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        Insert: {
          account_id: string
          assigned_at?: string | null
          assigned_user_id?: string | null
          capacity_class: string
          channel: string
          close_reason?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          customer_value?: number
          declined_by?: string[]
          ended_at?: string | null
          handled_by?: string
          id?: string
          kind: string
          metadata?: Json
          phone?: string | null
          preferred_until?: string | null
          preferred_user_id?: string | null
          priority?: number
          queue_id?: string | null
          required_level?: number
          required_skill?: string | null
          reserved_until?: string | null
          reserved_user_id?: string | null
          scheduled_at?: string | null
          sla_alerted_at?: string | null
          sla_due_at?: string | null
          source_id?: string | null
          source_table?: string
          status?: string
          subject?: string | null
          summary?: string | null
          updated_at?: string
          wrap?: Json
          wrap_confirmed_at?: string | null
          wrap_confirmed_by?: string | null
          wrap_next_action?: string | null
          wrap_reason?: string | null
          wrap_result?: string | null
        }
        Update: {
          account_id?: string
          assigned_at?: string | null
          assigned_user_id?: string | null
          capacity_class?: string
          channel?: string
          close_reason?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          customer_value?: number
          declined_by?: string[]
          ended_at?: string | null
          handled_by?: string
          id?: string
          kind?: string
          metadata?: Json
          phone?: string | null
          preferred_until?: string | null
          preferred_user_id?: string | null
          priority?: number
          queue_id?: string | null
          required_level?: number
          required_skill?: string | null
          reserved_until?: string | null
          reserved_user_id?: string | null
          scheduled_at?: string | null
          sla_alerted_at?: string | null
          sla_due_at?: string | null
          source_id?: string | null
          source_table?: string
          status?: string
          subject?: string | null
          summary?: string | null
          updated_at?: string
          wrap?: Json
          wrap_confirmed_at?: string | null
          wrap_confirmed_by?: string | null
          wrap_next_action?: string | null
          wrap_reason?: string | null
          wrap_result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "work_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "call_queues"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_settings: {
        Row: {
          account_id: string
          aht_seconds: Json
          answer_seconds: number
          chat_concurrency: number
          service_level_pct: number
          shrinkage_pct: number
          updated_at: string
          updated_by: string | null
          weeks_history: number
        }
        Insert: {
          account_id: string
          aht_seconds?: Json
          answer_seconds?: number
          chat_concurrency?: number
          service_level_pct?: number
          shrinkage_pct?: number
          updated_at?: string
          updated_by?: string | null
          weeks_history?: number
        }
        Update: {
          account_id?: string
          aht_seconds?: Json
          answer_seconds?: number
          chat_concurrency?: number
          service_level_pct?: number
          shrinkage_pct?: number
          updated_at?: string
          updated_by?: string | null
          weeks_history?: number
        }
        Relationships: [
          {
            foreignKeyName: "workforce_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_shifts: {
        Row: {
          account_id: string
          breaks: Json
          channel: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          note: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          breaks?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          note?: string | null
          starts_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          breaks?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          note?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_shifts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      zernio_call_permissions: {
        Row: {
          account_id: string
          channel_id: string
          contact_id: string | null
          expires_at: string | null
          id: string
          is_permanent: boolean
          phone: string
          requested_at: string | null
          requested_by: string | null
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          channel_id: string
          contact_id?: string | null
          expires_at?: string | null
          id?: string
          is_permanent?: boolean
          phone: string
          requested_at?: string | null
          requested_by?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          channel_id?: string
          contact_id?: string | null
          expires_at?: string | null
          id?: string
          is_permanent?: boolean
          phone?: string
          requested_at?: string | null
          requested_by?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zernio_call_permissions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zernio_call_permissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zernio_call_permissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "zernio_call_permissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zernio_calls: {
        Row: {
          account_id: string
          call_id: string
          channel: string
          created_at: string
          synced_at: string | null
          zernio_account_id: string | null
          zernio_call_id: string
        }
        Insert: {
          account_id: string
          call_id: string
          channel?: string
          created_at?: string
          synced_at?: string | null
          zernio_account_id?: string | null
          zernio_call_id: string
        }
        Update: {
          account_id?: string
          call_id?: string
          channel?: string
          created_at?: string
          synced_at?: string | null
          zernio_account_id?: string | null
          zernio_call_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zernio_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zernio_calls_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      zernio_numbers: {
        Row: {
          account_id: string
          calling: Json
          channel_id: string | null
          country: string | null
          created_at: string
          id: string
          kyc_url: string | null
          last_event_at: string | null
          monthly_cents: number | null
          number_type: string | null
          phone_number: string | null
          profile_id: string | null
          source: string
          status: string
          status_reason: string | null
          updated_at: string
          verification_url: string | null
          voice: Json
          whatsapp_account_id: string | null
          zernio_number_id: string
        }
        Insert: {
          account_id: string
          calling?: Json
          channel_id?: string | null
          country?: string | null
          created_at?: string
          id?: string
          kyc_url?: string | null
          last_event_at?: string | null
          monthly_cents?: number | null
          number_type?: string | null
          phone_number?: string | null
          profile_id?: string | null
          source?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          verification_url?: string | null
          voice?: Json
          whatsapp_account_id?: string | null
          zernio_number_id: string
        }
        Update: {
          account_id?: string
          calling?: Json
          channel_id?: string | null
          country?: string | null
          created_at?: string
          id?: string
          kyc_url?: string | null
          last_event_at?: string | null
          monthly_cents?: number | null
          number_type?: string | null
          phone_number?: string | null
          profile_id?: string | null
          source?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          verification_url?: string | null
          voice?: Json
          whatsapp_account_id?: string | null
          zernio_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zernio_numbers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zernio_numbers_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contact_attribution: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string | null
          first_at: string | null
          first_campaign: string | null
          first_channel: string | null
          first_medium: string | null
          first_source: string | null
          last_at: string | null
          last_campaign: string | null
          last_medium: string | null
          last_source: string | null
          lifecycle: string | null
          source: string | null
          won_count: number | null
          won_value: number | null
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          first_at?: never
          first_campaign?: never
          first_channel?: never
          first_medium?: never
          first_source?: never
          last_at?: never
          last_campaign?: never
          last_medium?: never
          last_source?: never
          lifecycle?: string | null
          source?: string | null
          won_count?: never
          won_value?: never
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          first_at?: never
          first_campaign?: never
          first_channel?: never
          first_medium?: never
          first_source?: never
          last_at?: never
          last_campaign?: never
          last_medium?: never
          last_source?: never
          lifecycle?: string | null
          source?: string | null
          won_count?: never
          won_value?: never
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consent_state: {
        Row: {
          account_id: string | null
          basis: string | null
          channel: string | null
          contact_id: string | null
          created_at: string | null
          source: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attribution"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_stats: {
        Row: {
          bounced: number | null
          campaign_id: string | null
          clicked: number | null
          complained: number | null
          delivered: number | null
          failed: number | null
          opened: number | null
          queued: number | null
          sent: number | null
          skipped: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _launch_whatsapp_campaign: {
        Args: { _campaign: string }
        Returns: number
      }
      _platform_has: { Args: { _name: string }; Returns: boolean }
      _platform_jobs: { Args: never; Returns: number }
      _platform_origin_ok: { Args: { _origin: string }; Returns: boolean }
      _platform_put: {
        Args: { _name: string; _value: string }
        Returns: undefined
      }
      _start_scheduled_whatsapp_campaign: {
        Args: { _at: string; _campaign: string }
        Returns: Json
      }
      accept_invite: {
        Args: { _full_name?: string; _token: string }
        Returns: string
      }
      accept_work_item: {
        Args: { _item: string }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_business_minutes: {
        Args: { _account: string; _from: string; _minutes: number }
        Returns: string
      }
      agent_secret: { Args: never; Returns: string }
      agents_import_legacy: { Args: { _account: string }; Returns: string }
      agents_mark_answered: { Args: { _account: string }; Returns: number }
      agents_overview: {
        Args: { _account: string; _days?: number }
        Returns: Json
      }
      agents_supervisor_candidates: {
        Args: { _account: string; _silent_minutes?: number }
        Returns: {
          assignee: string
          conversation_id: string
          detail: string
          kind: string
          waiting_since: string
        }[]
      }
      ai_month_spend: { Args: { _account: string }; Returns: number }
      apply_segment_template: {
        Args: { _account: string; _key: string; _model: Json }
        Returns: Json
      }
      audit: {
        Args: {
          _account: string
          _action: string
          _entity: string
          _entity_id: string
          _meta?: Json
        }
        Returns: undefined
      }
      automation_stats: {
        Args: { _account: string }
        Returns: {
          active: number
          automation_id: string
          converted: number
          done: number
          exited: number
          total: number
        }[]
      }
      best_contact_hour: { Args: { _contact: string }; Returns: number }
      bootstrap_account: {
        Args: { _full_name?: string; _name: string }
        Returns: string
      }
      build_opportunity: { Args: { _contact: string }; Returns: string }
      call_center_stats: { Args: { _account: string }; Returns: Json }
      can_contact: {
        Args: { _channel: string; _contact: string }
        Returns: boolean
      }
      can_see_channel: { Args: { _channel: string }; Returns: boolean }
      can_see_conversation: {
        Args: { _conversation: string }
        Returns: boolean
      }
      can_see_meeting: { Args: { _meeting: string }; Returns: boolean }
      can_see_ticket: { Args: { _ticket: string }; Returns: boolean }
      cancel_whatsapp_campaign: {
        Args: { _campaign: string }
        Returns: undefined
      }
      capture_form_submission: {
        Args: {
          _consent: Json
          _contact: Json
          _contact_source: string
          _custom: Json
          _form: string
          _submission: Json
          _touch: Json
          _visitor?: string
        }
        Returns: Json
      }
      capture_form_submission_base: {
        Args: {
          _consent: Json
          _contact: Json
          _contact_source: string
          _custom: Json
          _form: string
          _submission: Json
          _touch: Json
          _visitor?: string
        }
        Returns: Json
      }
      cc_agent_load: {
        Args: { _account: string; _user: string }
        Returns: number
      }
      cc_assign: {
        Args: { _item: string; _user: string }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cc_at_risk: {
        Args: { _due: string; _risk_seconds: number }
        Returns: boolean
      }
      cc_attempts_for: {
        Args: { _account: string; _days: number; _phone: string }
        Returns: number
      }
      cc_availability: {
        Args: { _account: string; _skill?: string }
        Returns: Json
      }
      cc_capacity_class: { Args: { _channel: string }; Returns: string }
      cc_customer_value: {
        Args: { _account: string; _contact: string }
        Returns: number
      }
      cc_fits: {
        Args: {
          _class: string
          _load: number
          _qa: Database["public"]["Tables"]["queue_agents"]["Row"]
        }
        Returns: boolean
      }
      cc_has_skill: {
        Args: {
          _account: string
          _level: number
          _skill: string
          _user: string
        }
        Returns: boolean
      }
      cc_housekeeping: { Args: never; Returns: Json }
      cc_indicators: {
        Args: { _account: string; _from: string; _to: string }
        Returns: Json
      }
      cc_live: { Args: { _account: string }; Returns: Json }
      cc_preferred_user: {
        Args: { _account: string; _contact: string }
        Returns: string
      }
      cc_queue_for: {
        Args: { _account: string; _channel: string; _queue?: string }
        Returns: {
          account_id: string
          business_hours: Json
          channels: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          overflow: string
          overflow_agent_id: string | null
          overflow_redirect: string | null
          required_level: number
          skills: string[]
          sla_seconds: number
          strategy: string
          zadarma_scenario_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "call_queues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cc_self_test: { Args: { _account: string }; Returns: Json }
      cc_settings: {
        Args: { _account: string }
        Returns: {
          account_id: string
          auto_callback_on_abandon: boolean
          dialing: Json
          dialing_accepted_at: string | null
          dialing_accepted_by: string | null
          offer_callback: boolean
          offer_whatsapp: boolean
          owner_wait_seconds: number
          reservation_seconds: number
          sla_risk_seconds: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "call_center_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cc_to_wrap_up: { Args: { _item: string }; Returns: undefined }
      cc_user_available: {
        Args: { _account: string; _user: string }
        Returns: boolean
      }
      check_service_heartbeats: { Args: never; Returns: Json }
      claim_domain_events: {
        Args: { _lease_seconds?: number; _limit?: number }
        Returns: {
          account_id: string
          claimed_until: string | null
          created_at: string
          dispatched_at: string | null
          entity: string
          entity_id: string | null
          id: number
          payload: Json
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "domain_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_first_account: { Args: { _full_name?: string }; Returns: string }
      claim_jobs: {
        Args: { _lease_seconds?: number; _limit?: number }
        Returns: {
          account_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_work_item: {
        Args: { _accept?: boolean; _account: string }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_rule_for: {
        Args: {
          _account: string
          _category: string
          _pipeline: string
          _product: string
          _user: string
        }
        Returns: {
          account_id: string
          active: boolean
          category: string | null
          created_at: string
          id: string
          name: string
          percent: number
          pipeline_id: string | null
          product_id: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      company_timeline: {
        Args: {
          _before?: string
          _company: string
          _kinds?: string[]
          _limit?: number
        }
        Returns: {
          at: string
          body: string
          contact_id: string
          contact_name: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      compute_commissions: { Args: { _deal: string }; Returns: number }
      confirm_form_email: {
        Args: { _proof?: Json; _token: string }
        Returns: boolean
      }
      confirm_wrap_up: {
        Args: {
          _item: string
          _next_action: string
          _next_due?: string
          _reason: string
          _result: string
        }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contact_reply_times: {
        Args: { _account: string; _days?: number }
        Returns: {
          contact_id: string
          dow: number
          hour: number
          n: number
        }[]
      }
      contact_timeline: {
        Args: { _before?: string; _contact: string; _limit?: number }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      contact_timeline_base: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      conversation_search: {
        Args: {
          _account: string
          _days?: number
          _limit?: number
          _q: string
          _source?: string
          _user?: string
        }
        Returns: {
          at: string
          contact_id: string
          contact_name: string
          excerpt: string
          source: string
          source_id: string
          speaker: string
          title: string
          user_id: string
        }[]
      }
      conversation_sla_sweep: { Args: never; Returns: number }
      create_account_for: {
        Args: { _full_name?: string; _name: string; _uid: string }
        Returns: string
      }
      create_api_key: {
        Args: { _account: string; _name: string; _scopes?: string[] }
        Returns: Json
      }
      create_proposal: {
        Args: {
          _conditions?: string
          _deal: string
          _notes?: string
          _title?: string
          _valid_days?: number
        }
        Returns: string
      }
      create_ticket: {
        Args: {
          _account: string
          _category?: string
          _contact?: string
          _conversation?: string
          _description?: string
          _owner?: string
          _priority?: string
          _source?: string
          _subject: string
        }
        Returns: string
      }
      cron_config: { Args: never; Returns: Json }
      cron_fast_tick: { Args: never; Returns: number }
      cron_tick: { Args: never; Returns: number }
      customer_health_signals: {
        Args: { _account: string }
        Returns: {
          breached_tickets: number
          company_name: string
          contact_id: string
          csat_avg_90d: number
          customer_since: string
          inbound_30d: number
          inbound_prev_30d: number
          last_interaction_at: string
          mrr: number
          name: string
          next_renewal_at: string
          nps_last: number
          open_tickets: number
          overdue_payments: number
          owner_user_id: string
          won_value_12m: number
        }[]
      }
      dashboard_gerencial: {
        Args: { _account: string; _days?: number }
        Returns: Json
      }
      dashboard_stats: {
        Args: { _account: string; _days?: number }
        Returns: Json
      }
      deal_room: { Args: { _deal: string }; Returns: Json }
      decline_work_item: { Args: { _item: string }; Returns: undefined }
      dev_schema_types: { Args: { _token: string }; Returns: string }
      email_link_secret: { Args: never; Returns: string }
      email_marketing_sent_today: {
        Args: { _account: string; _emails: string[] }
        Returns: {
          to_email: string
        }[]
      }
      emit_event: {
        Args: {
          _account: string
          _entity: string
          _entity_id: string
          _payload?: Json
          _type: string
        }
        Returns: undefined
      }
      enqueue_job: {
        Args: {
          _account: string
          _dedupe?: string
          _kind: string
          _payload: Json
          _run_at?: string
        }
        Returns: string
      }
      enqueue_scheduled_reports: { Args: never; Returns: number }
      enqueue_work_item: {
        Args: {
          _account: string
          _channel: string
          _contact?: string
          _due?: string
          _kind: string
          _metadata?: Json
          _phone?: string
          _preferred?: string
          _priority?: number
          _scheduled?: string
          _skill?: string
          _subject: string
          _summary?: string
        }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      excerpt_around: {
        Args: { _q: string; _text: string; _width?: number }
        Returns: string
      }
      finish_job: {
        Args: { _error?: string; _id: string; _ok: boolean; _result?: Json }
        Returns: undefined
      }
      finish_work_item: { Args: { _item: string }; Returns: undefined }
      garantir_plataforma: {
        Args: { _force?: boolean; _origin?: string }
        Returns: Json
      }
      garantir_privilegios: { Args: never; Returns: Json }
      gestao_trends: {
        Args: { _account: string; _from: string; _group?: string; _to: string }
        Returns: Json
      }
      goals_progress: {
        Args: { _account: string; _period?: string }
        Returns: {
          achieved: number
          goal_id: string
          metric: string
          target: number
          user_id: string
        }[]
      }
      has_column: {
        Args: { _column: string; _table: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _account: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      import_dnc_numbers: {
        Args: { _account: string; _numbers: string[]; _source?: string }
        Returns: Json
      }
      invite_preview: {
        Args: { _token: string }
        Returns: {
          account_name: string
          email: string
          expired: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      is_manager: { Args: { _account: string }; Returns: boolean }
      is_member: { Args: { _account: string }; Returns: boolean }
      kb_search: {
        Args: {
          _account: string
          _embedding?: string
          _limit?: number
          _model?: string
          _public_only?: boolean
          _query: string
        }
        Returns: {
          body_md: string
          category: string
          id: string
          score: number
          slug: string
          title: string
          visibility: string
        }[]
      }
      launch_whatsapp_campaign: { Args: { _campaign: string }; Returns: number }
      lead_features: {
        Args: { _account: string; _labeled: boolean; _limit?: number }
        Returns: {
          age_days: number
          company_size: string
          contact_id: string
          forms: number
          has_company: boolean
          has_email: boolean
          has_phone: boolean
          inbound: number
          industry: string
          label: number
          meetings: number
          outbound: number
          platform: string
          source: string
          temperature: string
        }[]
      }
      lead_route_bump: { Args: { _rule: string }; Returns: number }
      lead_source: {
        Args: { _c: Database["public"]["Tables"]["contacts"]["Row"] }
        Returns: string
      }
      mark_conversation_read: {
        Args: { _conversation: string }
        Returns: undefined
      }
      move_deal_to: {
        Args: { _deal: string; _target: string }
        Returns: undefined
      }
      my_day: { Args: { _account: string }; Returns: Json }
      next_counter: {
        Args: { _account: string; _key: string }
        Returns: number
      }
      next_counter_member: {
        Args: { _account: string; _key: string }
        Returns: number
      }
      next_ticket_number: { Args: { _account: string }; Returns: number }
      normalize_address: {
        Args: { _address: string; _channel: string }
        Returns: string
      }
      notification_channels: {
        Args: { _account: string; _kind: string; _user: string }
        Returns: {
          app: boolean
          email: boolean
          push: boolean
        }[]
      }
      notify_user: {
        Args: {
          _account: string
          _body?: string
          _kind: string
          _link?: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      outbound_number_health: {
        Args: { _account: string; _hours?: number }
        Returns: {
          answered: number
          avg_duration_seconds: number
          calls_last_hour: number
          calls_total: number
          number: string
          short_calls: number
        }[]
      }
      platform_adopt_alert: {
        Args: { _email: string; _from?: string; _key: string }
        Returns: boolean
      }
      platform_alert_email: {
        Args: { _subject: string; _text: string }
        Returns: boolean
      }
      platform_meta: { Args: never; Returns: Json }
      platform_set_vapid: {
        Args: { _private: string; _public: string }
        Returns: boolean
      }
      platform_status: { Args: never; Returns: Json }
      platform_vapid: { Args: never; Returns: Json }
      portal_secret: { Args: never; Returns: string }
      proposal_items_from_deal: { Args: { _deal: string }; Returns: Json }
      proposal_totals: { Args: { _items: Json }; Returns: Json }
      quality_overview: {
        Args: { _account: string; _days?: number }
        Returns: Json
      }
      quality_pending: {
        Args: { _limit?: number }
        Returns: {
          account_id: string
          interaction_end: string
          interaction_start: string
          source: string
          source_id: string
        }[]
      }
      quality_spend: { Args: { _account: string }; Returns: Json }
      quality_weak_evidence: {
        Args: {
          _account: string
          _criterion: string
          _days?: number
          _limit?: number
        }
        Returns: {
          comment: string
          evaluation_id: string
          evidence: string
          score: number
        }[]
      }
      recompute_deal_value: { Args: { _deal: string }; Returns: undefined }
      record_heartbeat: {
        Args: { _instance: string; _meta?: Json; _service: string }
        Returns: undefined
      }
      refresh_proposal: { Args: { _proposal: string }; Returns: undefined }
      register_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _user_agent?: string
        }
        Returns: string
      }
      report_activity_table: {
        Args: { _account: string; _from: string; _table: string; _to: string }
        Returns: Json
      }
      report_ai: { Args: { _account: string; _months?: number }; Returns: Json }
      report_attribution: {
        Args: { _account: string; _from: string; _to: string }
        Returns: Json
      }
      report_forecast: {
        Args: { _account: string; _months?: number }
        Returns: Json
      }
      report_guard: { Args: { _account: string }; Returns: undefined }
      report_mrr: {
        Args: { _account: string; _months?: number }
        Returns: Json
      }
      report_ops: {
        Args: { _account: string; _from: string; _to: string }
        Returns: Json
      }
      report_sales: {
        Args: {
          _account: string
          _from: string
          _pipeline?: string
          _to: string
        }
        Returns: Json
      }
      report_service: {
        Args: { _account: string; _from: string; _to: string }
        Returns: Json
      }
      request_callback: {
        Args: {
          _account: string
          _contact?: string
          _note?: string
          _phone: string
          _preferred?: string
          _skill?: string
          _when?: string
        }
        Returns: {
          account_id: string
          assigned_at: string | null
          assigned_user_id: string | null
          capacity_class: string
          channel: string
          close_reason: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          customer_value: number
          declined_by: string[]
          ended_at: string | null
          handled_by: string
          id: string
          kind: string
          metadata: Json
          phone: string | null
          preferred_until: string | null
          preferred_user_id: string | null
          priority: number
          queue_id: string | null
          required_level: number
          required_skill: string | null
          reserved_until: string | null
          reserved_user_id: string | null
          scheduled_at: string | null
          sla_alerted_at: string | null
          sla_due_at: string | null
          source_id: string | null
          source_table: string
          status: string
          subject: string | null
          summary: string | null
          updated_at: string
          wrap: Json
          wrap_confirmed_at: string | null
          wrap_confirmed_by: string | null
          wrap_next_action: string | null
          wrap_reason: string | null
          wrap_result: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      roleplay_ranking: {
        Args: { _account: string; _days?: number }
        Returns: {
          avg_score: number
          best_score: number
          last_at: string
          sessions: number
          user_id: string
        }[]
      }
      route_work_item: {
        Args: { _item: string }
        Returns: {
          extension: string
          reserved_until: string
          user_id: string
        }[]
      }
      run_report: {
        Args: { _account: string; _config: Json }
        Returns: {
          key: string
          label: string
          value: number
        }[]
      }
      sac_metrics: { Args: { _account: string; _days?: number }; Returns: Json }
      schedule_whatsapp_campaign: {
        Args: { _at: string; _campaign: string }
        Returns: undefined
      }
      secret_get: {
        Args: { _key: string; _scope: string; _scope_id: string }
        Returns: string
      }
      secret_keys: {
        Args: { _account: string; _scope: string; _scope_id: string }
        Returns: string[]
      }
      secret_set: {
        Args: {
          _account: string
          _key: string
          _scope: string
          _scope_id: string
          _value: string
        }
        Returns: undefined
      }
      set_presence: {
        Args: { _account: string; _reason?: string; _status: string }
        Returns: {
          account_id: string
          pause_reason: string | null
          since: string
          status: string
          updated_at: string
          user_id: string
          wrap_up_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agent_presence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      signup_mode: { Args: never; Returns: string }
      sla_for: {
        Args: { _account: string; _priority: string }
        Returns: {
          business_hours: boolean
          first_response_minutes: number
          policy_id: string
          resolution_minutes: number
        }[]
      }
      sla_for_ticket: {
        Args: {
          _account: string
          _company: string
          _contact: string
          _priority: string
        }
        Returns: {
          business_hours: boolean
          first_response_minutes: number
          policy_id: string
          resolution_minutes: number
          rule_id: string
        }[]
      }
      sla_rule_for: {
        Args: { _account: string; _company: string; _contact: string }
        Returns: {
          account_id: string
          applies_to: string
          business_hours: boolean
          created_at: string
          id: string
          is_active: boolean
          match_field: string | null
          match_kind: string
          match_value: string
          name: string
          position: number
          targets: Json
        }
        SetofOptions: {
          from: "*"
          to: "sla_plan_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sla_target_minutes: {
        Args: { _key: string; _priority: string; _targets: Json }
        Returns: number
      }
      slugify: { Args: { _s: string }; Returns: string }
      storage_account: { Args: { _name: string }; Returns: string }
      support_sla_sweep: { Args: never; Returns: number }
      take_forecast_snapshots: { Args: never; Returns: number }
      term_mentions: {
        Args: { _account: string; _days?: number }
        Returns: {
          category: string
          mentions: number
          term: string
          term_id: string
          week: string
        }[]
      }
      timeline_part_automations: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_calls: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_comercial: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_email: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_forms: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_meetings: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      timeline_part_support: {
        Args: { _contact: string }
        Returns: {
          at: string
          body: string
          kind: string
          meta: Json
          ref_id: string
          title: string
        }[]
      }
      transfer_conversation_to_queue: {
        Args: { _conversation: string; _note?: string; _queue: string }
        Returns: string
      }
      valid_conversation_tags: { Args: { _tags: string[] }; Returns: boolean }
      whatsapp_campaign_audience: {
        Args: { _account: string; _tags: string[] }
        Returns: {
          contact_id: string
        }[]
      }
      whatsapp_campaign_preview: {
        Args: { _account: string; _tags: string[] }
        Returns: Json
      }
      workforce_history: {
        Args: { _account: string; _weeks?: number }
        Returns: {
          arrivals: number
          channel: string
          day: string
          handle_seconds: number
          hour: number
        }[]
      }
      workforce_presence: {
        Args: { _account: string; _from: string; _to: string }
        Returns: Json
      }
      zernio_ensure_call: {
        Args: {
          _account: string
          _channel: string
          _direction: string
          _started_at: string
          _zernio_account_id: string
          _zernio_call_id: string
        }
        Returns: {
          call_id: string
          created: boolean
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "agent" | "seller"
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
      app_role: ["owner", "admin", "manager", "agent", "seller"],
    },
  },
} as const
