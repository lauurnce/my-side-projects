
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
            "activities": {
                  Row: {
                    "attempt_limit": number,"class_id": string,"created_at": string,"created_by": string,"due_at": string | null,"id": string,"instructions_md": string,"lesson_id": string | null,"points": number,"published_at": string | null,"requires_deck_id": string | null,"show_answers": string,"time_limit_min": number | null,"title": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_limit"?: number,"class_id": string,"created_at"?: string,"created_by"?: string,"due_at"?: string | null,"id"?: string,"instructions_md"?: string,"lesson_id"?: string | null,"points"?: number,"published_at"?: string | null,"requires_deck_id"?: string | null,"show_answers"?: string,"time_limit_min"?: number | null,"title": string,"type"?: string
                  }
                  Update: {
                    "attempt_limit"?: number,"class_id"?: string,"created_at"?: string,"created_by"?: string,"due_at"?: string | null,"id"?: string,"instructions_md"?: string,"lesson_id"?: string | null,"points"?: number,"published_at"?: string | null,"requires_deck_id"?: string | null,"show_answers"?: string,"time_limit_min"?: number | null,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_requires_deck_id_fkey"
      columns: ["requires_deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
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
                },"deck_contents": {
                  Row: {
                    "content": NonNullable<Json>,"deck_id": string,"last_save_id": string | null,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"deck_id": string,"last_save_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"deck_id"?: string,"last_save_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_contents_deck_id_fkey"
      columns: ["deck_id"]
isOneToOne: true
      referencedRelation: "decks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deck_contents_updated_by_fkey"
      columns: ["updated_by"]
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
                    "class_id": string,"created_at": string,"created_by": string,"id": string,"kind": string,"lesson_id": string | null,"original_path": string | null,"pdf_path": string | null,"ready_at": string | null,"size_bytes": number,"slide_count": number | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"created_by": string,"id"?: string,"kind": string,"lesson_id"?: string | null,"original_path"?: string | null,"pdf_path"?: string | null,"ready_at"?: string | null,"size_bytes": number,"slide_count"?: number | null,"title": string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"lesson_id"?: string | null,"original_path"?: string | null,"pdf_path"?: string | null,"ready_at"?: string | null,"size_bytes"?: number,"slide_count"?: number | null,"title"?: string
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
                },"post_events": {
                  Row: {
                    "actor_id": string | null,"happened_at": string,"id": string,"kind": string,"old_body": string | null,"post_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"happened_at"?: string,"id"?: string,"kind": string,"old_body"?: string | null,"post_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"happened_at"?: string,"id"?: string,"kind"?: string,"old_body"?: string | null,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_events_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "author_id": string | null,"author_name": string,"body": string,"created_at": string,"edit_count": number,"edited_at": string | null,"hidden_at": string | null,"hidden_by": string | null,"id": string,"is_question": boolean,"parent_id": string | null,"thread_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"author_name": string,"body": string,"created_at"?: string,"edit_count"?: number,"edited_at"?: string | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"id"?: string,"is_question"?: boolean,"parent_id"?: string | null,"thread_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"author_name"?: string,"body"?: string,"created_at"?: string,"edit_count"?: number,"edited_at"?: string | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"id"?: string,"is_question"?: boolean,"parent_id"?: string | null,"thread_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_hidden_by_fkey"
      columns: ["hidden_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "threads"
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
                },"quiz_answer_keys": {
                  Row: {
                    "answers": NonNullable<Json>,"question_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"question_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_answer_keys_question_id_fkey"
      columns: ["question_id"]
isOneToOne: true
      referencedRelation: "quiz_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_attempt_answers": {
                  Row: {
                    "answer": Json | null,"attempt_id": string,"is_correct": boolean | null,"question_id": string,"saved_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: Json | null,"attempt_id": string,"is_correct"?: boolean | null,"question_id": string,"saved_at"?: string
                  }
                  Update: {
                    "answer"?: Json | null,"attempt_id"?: string,"is_correct"?: boolean | null,"question_id"?: string,"saved_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_attempt_answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "quiz_attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_attempt_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "quiz_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_attempts": {
                  Row: {
                    "activity_id": string,"answers_seen_at": string | null,"attempt_no": number,"expires_at": string | null,"id": string,"max_score": number,"score": number | null,"started_at": string,"student_id": string,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"answers_seen_at"?: string | null,"attempt_no": number,"expires_at"?: string | null,"id"?: string,"max_score": number,"score"?: number | null,"started_at"?: string,"student_id": string,"submitted_at"?: string | null
                  }
                  Update: {
                    "activity_id"?: string,"answers_seen_at"?: string | null,"attempt_no"?: number,"expires_at"?: string | null,"id"?: string,"max_score"?: number,"score"?: number | null,"started_at"?: string,"student_id"?: string,"submitted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_attempts_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_attempts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_questions": {
                  Row: {
                    "activity_id": string,"id": string,"kind": string,"options": Json | null,"points": number,"position": number,"prompt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"id"?: string,"kind": string,"options"?: Json | null,"points"?: number,"position": number,"prompt": string
                  }
                  Update: {
                    "activity_id"?: string,"id"?: string,"kind"?: string,"options"?: Json | null,"points"?: number,"position"?: number,"prompt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_questions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_grade_log": {
                  Row: {
                    "activity_id": string,"feedback": string,"file_etag": string | null,"file_name": string,"file_path": string | null,"graded_at": string,"graded_by": string,"id": string,"new_score": number,"old_score": number | null,"size_bytes": number,"student_id": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"feedback": string,"file_etag"?: string | null,"file_name": string,"file_path"?: string | null,"graded_at"?: string,"graded_by": string,"id"?: string,"new_score": number,"old_score"?: number | null,"size_bytes": number,"student_id": string,"submission_id": string
                  }
                  Update: {
                    "activity_id"?: string,"feedback"?: string,"file_etag"?: string | null,"file_name"?: string,"file_path"?: string | null,"graded_at"?: string,"graded_by"?: string,"id"?: string,"new_score"?: number,"old_score"?: number | null,"size_bytes"?: number,"student_id"?: string,"submission_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"submission_uploads": {
                  Row: {
                    "activity_id": string,"declared_bytes": number,"file_name": string,"file_path": string,"id": string,"mime": string,"reserved_at": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"declared_bytes": number,"file_name": string,"file_path": string,"id"?: string,"mime": string,"reserved_at"?: string,"student_id": string
                  }
                  Update: {
                    "activity_id"?: string,"declared_bytes"?: number,"file_name"?: string,"file_path"?: string,"id"?: string,"mime"?: string,"reserved_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_uploads_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_uploads_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "activity_id": string,"feedback": string | null,"file_etag": string | null,"file_name": string,"file_path": string | null,"files_removed_at": string | null,"graded_at": string | null,"graded_by": string | null,"id": string,"is_late": boolean,"mime": string,"score": number | null,"size_bytes": number,"student_id": string,"submitted_at": string,"upload_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"feedback"?: string | null,"file_etag"?: string | null,"file_name": string,"file_path"?: string | null,"files_removed_at"?: string | null,"graded_at"?: string | null,"graded_by"?: string | null,"id"?: string,"is_late"?: boolean,"mime": string,"score"?: number | null,"size_bytes": number,"student_id": string,"submitted_at": string,"upload_id": string
                  }
                  Update: {
                    "activity_id"?: string,"feedback"?: string | null,"file_etag"?: string | null,"file_name"?: string,"file_path"?: string | null,"files_removed_at"?: string | null,"graded_at"?: string | null,"graded_by"?: string | null,"id"?: string,"is_late"?: boolean,"mime"?: string,"score"?: number | null,"size_bytes"?: number,"student_id"?: string,"submitted_at"?: string,"upload_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_graded_by_fkey"
      columns: ["graded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"threads": {
                  Row: {
                    "activity_id": string | null,"class_id": string,"created_at": string,"created_by": string | null,"id": string,"lesson_id": string | null,"locked": boolean,"locked_at": string | null,"locked_by": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"class_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lesson_id"?: string | null,"locked"?: boolean,"locked_at"?: string | null,"locked_by"?: string | null,"title": string,"version"?: number
                  }
                  Update: {
                    "activity_id"?: string | null,"class_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lesson_id"?: string | null,"locked"?: boolean,"locked_at"?: string | null,"locked_by"?: string | null,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "threads_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_locked_by_fkey"
      columns: ["locked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_post":
{ Args: { "post_body": string,"target_parent": string,"target_thread": string }; Returns: Json
                           },
"ask_question":
{ Args: { "question_body": string,"question_title": string,"target_activity": string,"target_lesson": string }; Returns: Json
                           },
"attempt_paper":
{ Args: { "target_attempt": string }; Returns: Json
                           },
"attempt_review":
{ Args: { "target_attempt": string }; Returns: Json
                           },
"cancel_submission_upload":
{ Args: { "target_upload": string }; Returns: string
                           },
"class_gradebook":
{ Args: { "target_class": string }; Returns: {
              "activity_id": string,"late": boolean,"points": number,"score": number,"state": string,"student_id": string,"submitted_at": string
            }[]
                           },
"class_join_code":
{ Args: { "target_class": string }; Returns: string
                           },
"class_threads":
{ Args: { "target_class": string }; Returns: {
              "activity_id": string,"author_name": string,"author_role": string,"created_at": string,"hidden_posts": number,"last_post_at": string,"lesson_id": string,"locked": boolean,"question_hidden": boolean,"replies": number,"target_title": string,"thread_id": string,"title": string
            }[]
                           },
"complete_deck":
{ Args: { "real_bytes": number,"slides": number,"target_deck": string }; Returns: string
                           },
"complete_submission":
{ Args: { "real_bytes": number,"stored_etag": string,"target_upload": string }; Returns: Json
                           },
"create_native_deck":
{ Args: { "content": Json,"deck_title": string,"editor": string,"target_class": string,"target_lesson": string }; Returns: Json
                           },
"deck_finished":
{ Args: { "target_deck": string,"target_student": string }; Returns: boolean
                           },
"deck_image_room":
{ Args: { "editor": string,"image_bytes": number,"target_deck": string }; Returns: string
                           },
"deck_view_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "deck_id": string,"viewed": number
            }[]
                           },
"delete_quiz_question":
{ Args: { "target_question": string }; Returns: string
                           },
"drop_graded_files":
{ Args: { "target_activity": string }; Returns: number
                           },
"edit_post":
{ Args: { "post_body": string,"target_post": string }; Returns: Json
                           },
"end_live":
{ Args: { "target_session": string }; Returns: string
                           },
"grade_check":
{ Args: { "answer": Json,"key_answers": Json,"question_kind": string }; Returns: boolean
                           },
"grade_submission":
{ Args: { "expected_upload": string,"new_feedback": string,"new_score": number,"target_submission": string }; Returns: Json
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
"move_quiz_question":
{ Args: { "step": number,"target_question": string }; Returns: string
                           },
"my_grades":
{ Args: Record<PropertyKey, never>; Returns: {
              "activity_id": string,"class_id": string,"late": boolean,"points": number,"score": number,"state": string,"submitted_at": string
            }[]
                           },
"post_history":
{ Args: { "target_post": string }; Returns: {
              "actor_name": string,"happened_at": string,"kind": string,"old_body": string
            }[]
                           },
"publish_native_deck":
{ Args: { "editor": string,"target_deck": string }; Returns: string
                           },
"quiz_keys":
{ Args: { "target_activity": string }; Returns: {
              "answers": Json,"question_id": string
            }[]
                           },
"rekey_quiz_question":
{ Args: { "key_answers": Json,"target_question": string }; Returns: Json
                           },
"remove_student":
{ Args: { "target_class": string,"target_student": string }; Returns: boolean
                           },
"reserve_deck":
{ Args: { "deck_kind": string,"deck_title": string,"declared_bytes": number,"target_class": string,"target_lesson": string }; Returns: Json
                           },
"reserve_submission":
{ Args: { "declared_bytes": number,"file_kind": string,"file_name": string,"target_activity": string }; Returns: Json
                           },
"save_answer":
{ Args: { "answer": Json,"target_attempt": string,"target_question": string }; Returns: Json
                           },
"save_deck_content":
{ Args: { "content": Json,"editor": string,"known_version": number,"save_id": string,"target_deck": string }; Returns: Json
                           },
"save_quiz_question":
{ Args: { "key_answers": Json,"question_kind": string,"question_options": Json,"question_points": number,"question_prompt": string,"target_activity": string,"target_question": string }; Returns: Json
                           },
"set_post_hidden":
{ Args: { "hide": boolean,"target_post": string }; Returns: Json
                           },
"set_thread_locked":
{ Args: { "lock": boolean,"target_thread": string }; Returns: Json
                           },
"settle_attempts":
{ Args: { "target_activity": string }; Returns: number
                           },
"start_attempt":
{ Args: { "target_activity": string }; Returns: Json
                           },
"start_live":
{ Args: { "slide": number,"target_deck": string }; Returns: Json
                           },
"storage_usage":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"student_altitude":
{ Args: { "target_student": string }; Returns: Json
                           },
"submit_attempt":
{ Args: { "answers": Json,"target_attempt": string }; Returns: Json
                           },
"sweep_decks":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"sweep_submissions":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"thread_view":
{ Args: { "known_version"?: number,"target_thread": string }; Returns: Json
                           },
"touch_live":
{ Args: { "target_session": string }; Returns: string
                           },
"unused_deck_images":
{ Args: { "target_deck": string }; Returns: string[]
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
