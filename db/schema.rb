# encoding: UTF-8
# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# Note that this schema.rb definition is the authoritative source for your
# database schema. If you need to create the application database on another
# system, you should be using db:schema:load, not running all the migrations
# from scratch. The latter is a flawed and unsustainable approach (the more migrations
# you'll amass, the slower it'll run and the greater likelihood for issues).
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema.define(version: 20170201100913) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "addresses", force: :cascade do |t|
    t.string   "address_1"
    t.string   "address_2"
    t.string   "country"
    t.string   "city"
    t.string   "state"
    t.string   "zip_code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "attachable_docs", force: :cascade do |t|
    t.integer  "company_doc_id"
    t.string   "orignal_file"
    t.integer  "documentable_id"
    t.string   "documentable_type"
    t.datetime "created_at",        null: false
    t.datetime "updated_at",        null: false
    t.string   "file"
  end

  add_index "attachable_docs", ["company_doc_id"], name: "index_attachable_docs_on_company_doc_id", using: :btree
  add_index "attachable_docs", ["documentable_type", "documentable_id"], name: "index_attachable_docs_on_documentable_type_and_documentable_id", using: :btree

  create_table "attachments", force: :cascade do |t|
    t.string   "file"
    t.string   "file_name"
    t.integer  "file_size"
    t.string   "file_type"
    t.string   "attachable_type"
    t.integer  "attachable_id"
    t.datetime "created_at",      null: false
    t.datetime "updated_at",      null: false
    t.integer  "company_id"
  end

  create_table "candidates", force: :cascade do |t|
    t.string   "first_name",             default: ""
    t.string   "last_name",              default: ""
    t.integer  "gender"
    t.string   "email",                  default: "", null: false
    t.string   "phone"
    t.string   "time_zone"
    t.integer  "primary_address_id"
    t.string   "photo"
    t.json     "signature"
    t.integer  "status"
    t.date     "dob"
    t.string   "encrypted_password",     default: "", null: false
    t.string   "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer  "sign_in_count",          default: 0,  null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string   "current_sign_in_ip"
    t.string   "last_sign_in_ip"
    t.string   "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "confirmation_sent_at"
    t.string   "unconfirmed_email"
    t.datetime "created_at",                          null: false
    t.datetime "updated_at",                          null: false
    t.string   "invitation_token"
    t.datetime "invitation_created_at"
    t.datetime "invitation_sent_at"
    t.datetime "invitation_accepted_at"
    t.integer  "invitation_limit"
    t.integer  "invited_by_id"
    t.string   "invited_by_type"
    t.integer  "invitations_count",      default: 0
    t.string   "resume"
    t.string   "skills"
    t.string   "description"
  end

  add_index "candidates", ["email"], name: "index_candidates_on_email", unique: true, using: :btree
  add_index "candidates", ["invitation_token"], name: "index_candidates_on_invitation_token", unique: true, using: :btree
  add_index "candidates", ["invitations_count"], name: "index_candidates_on_invitations_count", using: :btree
  add_index "candidates", ["invited_by_id"], name: "index_candidates_on_invited_by_id", using: :btree
  add_index "candidates", ["reset_password_token"], name: "index_candidates_on_reset_password_token", unique: true, using: :btree

  create_table "candidates_companies", id: false, force: :cascade do |t|
    t.integer "candidate_id"
    t.integer "company_id"
  end

  add_index "candidates_companies", ["candidate_id", "company_id"], name: "index_candidates_companies_on_candidate_id_and_company_id", unique: true, using: :btree

  create_table "candidates_groups", id: false, force: :cascade do |t|
    t.integer "group_id"
    t.integer "candidate_id"
  end

  add_index "candidates_groups", ["candidate_id"], name: "index_candidates_groups_on_candidate_id", using: :btree
  add_index "candidates_groups", ["group_id"], name: "index_candidates_groups_on_group_id", using: :btree

  create_table "comments", force: :cascade do |t|
    t.string   "body"
    t.integer  "commentable_id"
    t.string   "commentable_type"
    t.integer  "created_by_id"
    t.datetime "created_at",       null: false
    t.datetime "updated_at",       null: false
  end

  add_index "comments", ["created_by_id"], name: "index_comments_on_created_by_id", using: :btree

  create_table "companies", force: :cascade do |t|
    t.integer  "owner_id"
    t.string   "name"
    t.string   "website"
    t.string   "logo"
    t.text     "description"
    t.string   "phone"
    t.string   "email"
    t.string   "slug"
    t.string   "tag_line"
    t.string   "linkedin_url"
    t.string   "facebook_url"
    t.string   "twitter_url"
    t.string   "google_url"
    t.string   "time_zone"
    t.boolean  "is_activated",             default: false
    t.string   "dba"
    t.integer  "status"
    t.date     "established_date"
    t.integer  "entity_type"
    t.integer  "hr_manager_id"
    t.integer  "billing_contact_id"
    t.string   "accountant_contact_email"
    t.datetime "created_at",                               null: false
    t.datetime "updated_at",                               null: false
    t.integer  "company_type"
    t.integer  "currency_id"
    t.string   "domain"
  end

  add_index "companies", ["owner_id"], name: "index_companies_on_owner_id", using: :btree

  create_table "company_docs", force: :cascade do |t|
    t.string   "name"
    t.integer  "doc_type"
    t.integer  "created_by"
    t.integer  "company_id"
    t.string   "file"
    t.boolean  "is_required_signature"
    t.datetime "created_at",            null: false
    t.datetime "updated_at",            null: false
  end

  create_table "consultant_profiles", force: :cascade do |t|
    t.integer  "consultant_id"
    t.string   "designation"
    t.date     "joining_date"
    t.integer  "location_id"
    t.integer  "employment_type"
    t.integer  "salary_type"
    t.float    "salary"
    t.datetime "created_at",      null: false
    t.datetime "updated_at",      null: false
  end

  add_index "consultant_profiles", ["consultant_id"], name: "index_consultant_profiles_on_consultant_id", using: :btree

  create_table "contract_terms", force: :cascade do |t|
    t.decimal  "rate"
    t.text     "note"
    t.text     "terms_condition"
    t.integer  "created_by"
    t.integer  "status",          default: 0
    t.integer  "contract_id"
    t.datetime "created_at",                  null: false
    t.datetime "updated_at",                  null: false
  end

  add_index "contract_terms", ["created_by"], name: "index_contract_terms_on_created_by", using: :btree

  create_table "contracts", force: :cascade do |t|
    t.integer  "job_application_id"
    t.integer  "job_id"
    t.date     "start_date"
    t.date     "end_date"
    t.string   "message_from_hiring"
    t.string   "response_from_vendor"
    t.integer  "created_by_id"
    t.integer  "respond_by_id"
    t.string   "responed_at"
    t.integer  "status",                default: 0
    t.integer  "assignee_id"
    t.datetime "created_at",                            null: false
    t.datetime "updated_at",                            null: false
    t.integer  "billing_frequency"
    t.integer  "time_sheet_frequency"
    t.integer  "company_id"
    t.date     "next_invoice_date"
    t.boolean  "is_commission",         default: false
    t.integer  "commission_type"
    t.float    "commission_amount",     default: 0.0
    t.float    "max_commission"
    t.integer  "commission_for_id"
    t.json     "received_by_signature"
    t.string   "received_by_name"
    t.json     "sent_by_signature"
    t.string   "sent_by_name"
    t.integer  "contractable_id"
    t.string   "contractable_type"
    t.integer  "parent_contract_id"
    t.integer  "contract_type"
  end

  create_table "currencies", force: :cascade do |t|
    t.string   "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "custom_fields", force: :cascade do |t|
    t.string   "name"
    t.string   "value"
    t.integer  "status"
    t.integer  "customizable_id"
    t.string   "customizable_type"
    t.datetime "created_at",        null: false
    t.datetime "updated_at",        null: false
  end

  create_table "delayed_jobs", force: :cascade do |t|
    t.integer  "priority",   default: 0, null: false
    t.integer  "attempts",   default: 0, null: false
    t.text     "handler",                null: false
    t.text     "last_error"
    t.datetime "run_at"
    t.datetime "locked_at"
    t.datetime "failed_at"
    t.string   "locked_by"
    t.string   "queue"
    t.datetime "created_at"
    t.datetime "updated_at"
  end

  add_index "delayed_jobs", ["priority", "run_at"], name: "delayed_jobs_priority", using: :btree

  create_table "educations", force: :cascade do |t|
    t.string   "degree_title"
    t.string   "grade"
    t.date     "completion_year"
    t.date     "start_year"
    t.string   "institute"
    t.integer  "status"
    t.text     "description"
    t.integer  "user_id"
    t.datetime "created_at",      null: false
    t.datetime "updated_at",      null: false
  end

  create_table "experiences", force: :cascade do |t|
    t.string   "experience_title"
    t.date     "start_date"
    t.date     "end_date"
    t.string   "institute"
    t.integer  "status"
    t.text     "description"
    t.integer  "user_id"
    t.datetime "created_at",       null: false
    t.datetime "updated_at",       null: false
  end

  create_table "groups", force: :cascade do |t|
    t.string   "group_name"
    t.integer  "company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_index "groups", ["company_id"], name: "index_groups_on_company_id", using: :btree

  create_table "invited_companies", force: :cascade do |t|
    t.integer  "user_id"
    t.integer  "invited_company_id"
    t.integer  "invited_by_company_id"
    t.datetime "created_at",            null: false
    t.datetime "updated_at",            null: false
  end

  add_index "invited_companies", ["invited_by_company_id"], name: "index_invited_companies_on_invited_by_company_id", using: :btree
  add_index "invited_companies", ["invited_company_id"], name: "index_invited_companies_on_invited_company_id", using: :btree
  add_index "invited_companies", ["user_id"], name: "index_invited_companies_on_user_id", using: :btree

  create_table "invoices", force: :cascade do |t|
    t.integer  "contract_id"
    t.date     "start_date"
    t.date     "end_date"
    t.datetime "created_at",                       null: false
    t.datetime "updated_at",                       null: false
    t.decimal  "total_amount",       default: 0.0
    t.decimal  "commission_amount",  default: 0.0
    t.decimal  "billing_amount",     default: 0.0
    t.float    "consultant_amount",  default: 0.0
    t.integer  "submitted_by"
    t.datetime "submitted_on"
    t.integer  "status",             default: 0
    t.integer  "total_approve_time", default: 0
    t.integer  "parent_id"
    t.decimal  "rate",               default: 0.0
  end

  create_table "job_applications", force: :cascade do |t|
    t.integer  "job_invitation_id"
    t.text     "cover_letter"
    t.string   "message"
    t.integer  "status",               default: 0
    t.datetime "created_at",                       null: false
    t.datetime "updated_at",                       null: false
    t.integer  "job_id"
    t.integer  "application_type"
    t.integer  "company_id"
    t.integer  "applicationable_id"
    t.string   "applicationable_type"
    t.string   "applicant_resume"
    t.string   "share_key"
  end

  create_table "job_invitations", force: :cascade do |t|
    t.integer  "recipient_id"
    t.string   "email"
    t.string   "recipient_type"
    t.integer  "created_by_id"
    t.integer  "job_id"
    t.integer  "status",           default: 0
    t.datetime "created_at",                   null: false
    t.datetime "updated_at",                   null: false
    t.date     "expiry"
    t.string   "message"
    t.integer  "company_id"
    t.integer  "invitation_type"
    t.text     "response_message"
  end

  create_table "jobs", force: :cascade do |t|
    t.string   "title"
    t.text     "description"
    t.string   "location"
    t.date     "start_date"
    t.date     "end_date"
    t.integer  "parent_job_id"
    t.integer  "company_id"
    t.integer  "created_by_id"
    t.datetime "created_at",                          null: false
    t.datetime "updated_at",                          null: false
    t.boolean  "is_public",           default: true
    t.string   "job_category"
    t.boolean  "is_system_generated", default: false
    t.datetime "deleted_at"
  end

  add_index "jobs", ["deleted_at"], name: "index_jobs_on_deleted_at", using: :btree

  create_table "leaves", force: :cascade do |t|
    t.date     "from_date"
    t.date     "till_date"
    t.string   "reason"
    t.string   "response_message"
    t.integer  "status",           default: 0
    t.string   "leave_type"
    t.integer  "user_id"
    t.datetime "created_at",                   null: false
    t.datetime "updated_at",                   null: false
  end

  create_table "locations", force: :cascade do |t|
    t.string   "name"
    t.integer  "address_id"
    t.integer  "company_id"
    t.integer  "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "notifications", force: :cascade do |t|
    t.integer  "notifiable_id"
    t.string   "notifiable_type"
    t.text     "message"
    t.integer  "status",            default: 0
    t.string   "title"
    t.integer  "notification_type", default: 0
    t.datetime "created_at",                    null: false
    t.datetime "updated_at",                    null: false
  end

  create_table "packages", force: :cascade do |t|
    t.string   "name"
    t.text     "description"
    t.integer  "duration"
    t.float    "price"
    t.string   "slug"
    t.datetime "created_at",  null: false
    t.datetime "updated_at",  null: false
  end

  create_table "permissions", force: :cascade do |t|
    t.string   "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "permissions_roles", id: false, force: :cascade do |t|
    t.integer "role_id"
    t.integer "permission_id"
  end

  create_table "roles", force: :cascade do |t|
    t.string   "name"
    t.integer  "company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "roles_users", id: false, force: :cascade do |t|
    t.integer "role_id"
    t.integer "user_id"
  end

  create_table "subscriptions", force: :cascade do |t|
    t.integer  "company_id"
    t.integer  "package_id"
    t.datetime "expiry"
    t.integer  "status"
    t.float    "amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "taggings", force: :cascade do |t|
    t.integer  "tag_id"
    t.integer  "taggable_id"
    t.string   "taggable_type"
    t.integer  "tagger_id"
    t.string   "tagger_type"
    t.string   "context",       limit: 128
    t.datetime "created_at"
  end

  add_index "taggings", ["context"], name: "index_taggings_on_context", using: :btree
  add_index "taggings", ["tag_id", "taggable_id", "taggable_type", "context", "tagger_id", "tagger_type"], name: "taggings_idx", unique: true, using: :btree
  add_index "taggings", ["tag_id"], name: "index_taggings_on_tag_id", using: :btree
  add_index "taggings", ["taggable_id", "taggable_type", "context"], name: "index_taggings_on_taggable_id_and_taggable_type_and_context", using: :btree
  add_index "taggings", ["taggable_id", "taggable_type", "tagger_id", "context"], name: "taggings_idy", using: :btree
  add_index "taggings", ["taggable_id"], name: "index_taggings_on_taggable_id", using: :btree
  add_index "taggings", ["taggable_type"], name: "index_taggings_on_taggable_type", using: :btree
  add_index "taggings", ["tagger_id", "tagger_type"], name: "index_taggings_on_tagger_id_and_tagger_type", using: :btree
  add_index "taggings", ["tagger_id"], name: "index_taggings_on_tagger_id", using: :btree

  create_table "tags", force: :cascade do |t|
    t.string  "name"
    t.integer "taggings_count", default: 0
  end

  add_index "tags", ["name"], name: "index_tags_on_name", unique: true, using: :btree

  create_table "timesheet_approvers", force: :cascade do |t|
    t.integer  "user_id"
    t.integer  "timesheet_id"
    t.datetime "created_at",   null: false
    t.datetime "updated_at",   null: false
    t.integer  "status"
  end

  add_index "timesheet_approvers", ["user_id", "timesheet_id"], name: "index_timesheet_approvers_on_user_id_and_timesheet_id", using: :btree

  create_table "timesheet_logs", force: :cascade do |t|
    t.integer  "timesheet_id"
    t.date     "transaction_day"
    t.integer  "status",           default: 0
    t.datetime "created_at",                   null: false
    t.datetime "updated_at",                   null: false
    t.integer  "contract_term_id"
  end

  add_index "timesheet_logs", ["timesheet_id"], name: "index_timesheet_logs_on_timesheet_id", using: :btree

  create_table "timesheets", force: :cascade do |t|
    t.integer  "job_id"
    t.integer  "user_id"
    t.integer  "company_id"
    t.integer  "contract_id"
    t.integer  "status",                      default: 0
    t.float    "total_time"
    t.date     "start_date"
    t.date     "end_date"
    t.date     "submitted_date"
    t.date     "next_timesheet_created_date"
    t.datetime "created_at",                              null: false
    t.datetime "updated_at",                              null: false
    t.integer  "invoice_id"
  end

  add_index "timesheets", ["job_id"], name: "index_timesheets_on_job_id", using: :btree

  create_table "transactions", force: :cascade do |t|
    t.integer  "timesheet_log_id"
    t.datetime "start_time"
    t.datetime "end_time"
    t.integer  "total_time",       default: 0
    t.integer  "status",           default: 0
    t.text     "memo"
    t.datetime "created_at",                   null: false
    t.datetime "updated_at",                   null: false
    t.string   "file"
  end

  add_index "transactions", ["timesheet_log_id"], name: "index_transactions_on_timesheet_log_id", using: :btree

  create_table "users", force: :cascade do |t|
    t.integer  "company_id"
    t.string   "first_name",             default: ""
    t.string   "last_name",              default: ""
    t.integer  "gender"
    t.string   "email",                  default: "",    null: false
    t.string   "type"
    t.string   "phone"
    t.integer  "primary_address_id"
    t.string   "photo"
    t.json     "signature"
    t.integer  "status"
    t.date     "dob"
    t.string   "encrypted_password",     default: "",    null: false
    t.string   "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer  "sign_in_count",          default: 0,     null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string   "current_sign_in_ip"
    t.string   "last_sign_in_ip"
    t.string   "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "confirmation_sent_at"
    t.string   "unconfirmed_email"
    t.datetime "created_at",                             null: false
    t.datetime "updated_at",                             null: false
    t.string   "invitation_token"
    t.datetime "invitation_created_at"
    t.datetime "invitation_sent_at"
    t.datetime "invitation_accepted_at"
    t.integer  "invitation_limit"
    t.integer  "invited_by_id"
    t.string   "invited_by_type"
    t.integer  "invitations_count",      default: 0
    t.string   "skills"
    t.string   "ssn"
    t.integer  "max_working_hours",      default: 28800
    t.string   "time_zone"
    t.integer  "candidate_id"
    t.datetime "deleted_at"
  end

  add_index "users", ["deleted_at"], name: "index_users_on_deleted_at", using: :btree
  add_index "users", ["email"], name: "index_users_on_email", unique: true, using: :btree
  add_index "users", ["invitation_token"], name: "index_users_on_invitation_token", unique: true, using: :btree
  add_index "users", ["invitations_count"], name: "index_users_on_invitations_count", using: :btree
  add_index "users", ["invited_by_id"], name: "index_users_on_invited_by_id", using: :btree
  add_index "users", ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true, using: :btree

end
