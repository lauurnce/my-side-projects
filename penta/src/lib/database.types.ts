
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "classes": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"join_code": string,"section": string,"teacher_id": string,"term": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"join_code"?: string,"section"?: string,"teacher_id": string,"term"?: string,"title": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"join_code"?: string,"section"?: string,"teacher_id"?: string,"term"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"deck_views": {
                  Row: {
                    "deck_id": string,"slide_no": number,"student_id": string,"viewed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deck_id": string,"slide_no": number,"student_id": string,"viewed_at"?: string
                  }
                  Update: {
                    "deck_id"?: string,"slide_no"?: number,"student_id"?: string,"viewed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_views_deck_id_fkey"
      columns: ["deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deck_views_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"decks": {
                  Row: {
                    "class_id": string,"created_at": string,"created_by": string,"id": string,"kind": string,"lesson_id": string | null,"original_path": string | null,"pdf_path": string,"ready_at": string | null,"size_bytes": number,"slide_count": number | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"created_by": string,"id"?: string,"kind": string,"lesson_id"?: string | null,"original_path"?: string | null,"pdf_path": string,"ready_at"?: string | null,"size_bytes": number,"slide_count"?: number | null,"title": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"lesson_id"?: string | null,"original_path"?: string | null,"pdf_path"?: string,"ready_at"?: string | null,"size_bytes"?: number,"slide_count"?: number | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decks_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decks_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "class_id": string,"joined_at": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"joined_at"?: string,"student_id": string
                  }
                  Update: {
                    "class_id"?: string,"joined_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"join_attempts": {
                  Row: {
                    "attempted_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempted_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "join_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_progress": {
                  Row: {
                    "completed_at": string,"lesson_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"lesson_id": string,"student_id": string
                  }
                  Update: {
                    "completed_at"?: string,"lesson_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_progress_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_progress_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "body_md": string,"created_at": string,"est_minutes": number,"id": string,"module_id": string,"position": number,"published_at": string | null,"revision": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body_md"?: string,"created_at"?: string,"est_minutes"?: number,"id"?: string,"module_id": string,"position"?: number,"published_at"?: string | null,"revision"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body_md"?: string,"created_at"?: string,"est_minutes"?: number,"id"?: string,"module_id"?: string,"position"?: number,"published_at"?: string | null,"revision"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "modules"
      referencedColumns: ["id"]
    }
                  ]
                },"live_sessions": {
                  Row: {
                    "active_at": string,"current_slide": number,"deck_id": string,"ended_at": string | null,"id": string,"revision": number,"started_at": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_at"?: string,"current_slide": number,"deck_id": string,"ended_at"?: string | null,"id"?: string,"revision"?: number,"started_at"?: string,"teacher_id": string
                  }
                  Update: {
                    "active_at"?: string,"current_slide"?: number,"deck_id"?: string,"ended_at"?: string | null,"id"?: string,"revision"?: number,"started_at"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_sessions_deck_id_fkey"
      columns: ["deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_sessions_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"modules": {
                  Row: {
                    "class_id": string,"created_at": string,"id": string,"position": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"id"?: string,"position"?: number,"title": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"id"?: string,"position"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modules_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"role"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "class_join_code":
{ Args: { "target_class": string }; Returns: string
                           },
"complete_deck":
{ Args: { "real_bytes": number,"slides": number,"target_deck": string }; Returns: string
                           },
"deck_finished":
{ Args: { "target_deck": string,"target_student": string }; Returns: boolean
                           },
"end_live":
{ Args: { "target_session": string }; Returns: string
                           },
"join_class":
{ Args: { "code": string }; Returns: Json
                           },
"live_now":
{ Args: Record<PropertyKey, never>; Returns: {
              "class_id": string,"current_slide": number,"deck_id": string,"revision": number,"session_id": string
            }[]
                           },
"live_state":
{ Args: { "target_deck": string }; Returns: Json
                           },
"move_lesson":
{ Args: { "step": number,"target": string }; Returns: string
                           },
"move_live":
{ Args: { "slide": number,"target_session": string }; Returns: Json
                           },
"move_module":
{ Args: { "step": number,"target": string }; Returns: string
                           },
"remove_student":
{ Args: { "target_class": string,"target_student": string }; Returns: boolean
                           },
"reserve_deck":
{ Args: { "deck_kind": string,"deck_title": string,"declared_bytes": number,"target_class": string,"target_lesson": string }; Returns: Json
                           },
"start_live":
{ Args: { "slide": number,"target_deck": string }; Returns: Json
                           },
"storage_usage":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"sweep_decks":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"touch_live":
{ Args: { "target_session": string }; Returns: string
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
