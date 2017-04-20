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

ActiveRecord::Schema.define(version: 20170406104051) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "account", id: :bigserial, force: :cascade do |t|
    t.text    "email",                                         null: false
    t.string  "email_hash",         limit: 16,                 null: false
    t.text    "password_hash",                                 null: false
    t.boolean "is_superuser",                  default: false, null: false
    t.boolean "is_real_user",                  default: false, null: false
    t.boolean "member_connections",            default: true,  null: false
  end

  add_index "account", ["email_hash"], name: "account_email_hash", using: :btree

  create_table "account_properties", id: :bigserial, force: :cascade do |t|
    t.integer "account_id", limit: 8,                null: false
    t.text    "name",                                null: false
    t.boolean "value",                default: true, null: false
  end

  add_index "account_properties", ["account_id", "name"], name: "account_properties_account_id_name_key", unique: true, using: :btree

  create_table "activities", force: :cascade do |t|
    t.integer  "trackable_id"
    t.string   "trackable_type"
    t.integer  "owner_id"
    t.string   "owner_type"
    t.string   "key"
    t.text     "parameters"
    t.integer  "recipient_id"
    t.string   "recipient_type"
    t.datetime "created_at"
    t.datetime "updated_at"
  end

  add_index "activities", ["owner_id", "owner_type"], name: "index_activities_on_owner_id_and_owner_type", using: :btree
  add_index "activities", ["recipient_id", "recipient_type"], name: "index_activities_on_recipient_id_and_recipient_type", using: :btree
  add_index "activities", ["trackable_id", "trackable_type"], name: "index_activities_on_trackable_id_and_trackable_type", using: :btree

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
    t.integer  "status",                 default: 0
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

  add_index "candidates", ["invitation_token"], name: "index_candidates_on_invitation_token", unique: true, using: :btree
  add_index "candidates", ["invitations_count"], name: "index_candidates_on_invitations_count", using: :btree
  add_index "candidates", ["invited_by_id"], name: "index_candidates_on_invited_by_id", using: :btree
  add_index "candidates", ["reset_password_token"], name: "index_candidates_on_reset_password_token", unique: true, using: :btree

  create_table "candidates_companies", id: false, force: :cascade do |t|
    t.integer "candidate_id"
    t.integer "company_id"
    t.integer "status",       default: 0
  end

  add_index "candidates_companies", ["candidate_id", "company_id"], name: "index_candidates_companies_on_candidate_id_and_company_id", unique: true, using: :btree

  create_table "candidates_groups", id: false, force: :cascade do |t|
    t.integer "group_id"
    t.integer "candidate_id"
  end

  add_index "candidates_groups", ["candidate_id"], name: "index_candidates_groups_on_candidate_id", using: :btree
  add_index "candidates_groups", ["group_id"], name: "index_candidates_groups_on_group_id", using: :btree

  create_table "chat_users", force: :cascade do |t|
    t.integer  "chat_id"
    t.integer  "status"
    t.integer  "userable_id"
    t.string   "userable_type"
    t.datetime "created_at",    null: false
    t.datetime "updated_at",    null: false
  end

  add_index "chat_users", ["chat_id", "userable_id", "userable_type"], name: "index_chat_users_on_chat_id_and_userable_id_and_userable_type", unique: true, using: :btree
  add_index "chat_users", ["userable_type", "userable_id"], name: "index_chat_users_on_userable_type_and_userable_id", using: :btree

  create_table "chats", force: :cascade do |t|
    t.string   "slug"
    t.integer  "chatable_id"
    t.string   "chatable_type"
    t.datetime "created_at",    null: false
    t.datetime "updated_at",    null: false
    t.integer  "company_id"
  end

  add_index "chats", ["chatable_type", "chatable_id"], name: "index_chats_on_chatable_type_and_chatable_id", using: :btree

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

  create_table "company", id: :bigserial, force: :cascade do |t|
    t.text "name", null: false
  end

  add_index "company", ["name"], name: "company_name_key", unique: true, using: :btree

  create_table "company_contacts", force: :cascade do |t|
    t.integer  "company_id"
    t.string   "first_name"
    t.string   "last_name"
    t.string   "email",      default: "", null: false
    t.string   "phone"
    t.integer  "status"
    t.datetime "created_at",              null: false
    t.datetime "updated_at",              null: false
    t.string   "title"
    t.string   "photo"
  end

  add_index "company_contacts", ["company_id", "email"], name: "index_company_contacts_on_company_id_and_email", unique: true, using: :btree

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

  create_table "connection", primary_key: "left_id", force: :cascade do |t|
    t.integer "right_id", limit: 8, null: false
  end

  create_table "connection_request", primary_key: "requestor_id", force: :cascade do |t|
    t.integer  "requestee_id", limit: 8,                   null: false
    t.boolean  "rejected",               default: false,   null: false
    t.datetime "request_time",           default: "now()", null: false
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

  create_table "credit_verification", primary_key: "user_id", force: :cascade do |t|
    t.integer "credit_id",   limit: 8, null: false
    t.boolean "is_positive",           null: false
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
    t.datetime "created_at",                        null: false
    t.datetime "updated_at",                        null: false
    t.boolean  "required",          default: false
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

  create_table "event", id: :bigserial, force: :cascade do |t|
    t.text     "subject",                       null: false
    t.text     "verb",                          null: false
    t.text     "object",                        null: false
    t.datetime "happened_at", default: "now()", null: false
  end

  add_index "event", ["happened_at"], name: "event_happened_at", using: :btree

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

  create_table "game", id: :bigserial, force: :cascade do |t|
    t.text    "name",                          null: false
    t.text    "publisher"
    t.integer "publication_year"
    t.integer "maker_ids",        default: [], null: false, array: true
    t.integer "maker_ids_count",  default: 0,  null: false
  end

  create_table "game_credit", id: :bigserial, force: :cascade do |t|
    t.integer "maker_id",    limit: 8,              null: false
    t.integer "game_id",     limit: 8,              null: false
    t.integer "company_id",  limit: 8
    t.integer "role_id",     limit: 8
    t.integer "start_year"
    t.integer "start_month"
    t.integer "end_year"
    t.integer "end_month"
    t.integer "platforms",             default: [], null: false, array: true
    t.text    "location"
  end

  create_table "game_image", id: :bigserial, force: :cascade do |t|
    t.integer  "game_id",       limit: 8, null: false
    t.text     "format",                  null: false
    t.text     "url",                     null: false
    t.datetime "expiring_time"
  end

  create_table "game_maker", id: :bigserial, force: :cascade do |t|
    t.integer "account_id",      limit: 8
    t.text    "curr_role"
    t.text    "curr_company"
    t.text    "curr_game"
    t.text    "skills"
    t.text    "accomplishments"
    t.integer "times_verified",            default: 0, null: false
    t.date    "available_at"
  end

  create_table "groupables", force: :cascade do |t|
    t.integer  "group_id"
    t.integer  "groupable_id"
    t.string   "groupable_type"
    t.datetime "created_at",     null: false
    t.datetime "updated_at",     null: false
  end

  add_index "groupables", ["groupable_type", "groupable_id"], name: "index_groupables_on_groupable_type_and_groupable_id", using: :btree

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

  create_table "job_application", primary_key: "job_id", force: :cascade do |t|
    t.integer "applicant_id", limit: 8, null: false
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

  create_table "job_card", id: :bigserial, force: :cascade do |t|
    t.integer "owner_id",     limit: 8,                   null: false
    t.integer "role_id",      limit: 8,                   null: false
    t.integer "company_id",   limit: 8,                   null: false
    t.text    "location",                                 null: false
    t.text    "description",                              null: false
    t.string  "img_url",      limit: 512
    t.date    "start_date"
    t.boolean "has_job_logo",             default: false, null: false
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

  create_table "join_request", id: :bigserial, force: :cascade do |t|
    t.text     "first_name",                                   null: false
    t.text     "last_name",                                    null: false
    t.text     "email",                                        null: false
    t.text     "curr_company",                                 null: false
    t.text     "curr_role",                                    null: false
    t.text     "curr_game",                                    null: false
    t.datetime "request_time",               default: "now()", null: false
    t.string   "social_provider", limit: 64
    t.string   "social_key",      limit: 64
    t.text     "password"
  end

  add_index "join_request", ["email"], name: "join_request_email_key", unique: true, using: :btree

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

  create_table "messages", force: :cascade do |t|
    t.string   "body"
    t.integer  "chat_id"
    t.integer  "messageable_id"
    t.string   "messageable_type"
    t.datetime "created_at",                   null: false
    t.datetime "updated_at",                   null: false
    t.integer  "company_doc_id"
    t.integer  "file_status",      default: 0
  end

  add_index "messages", ["messageable_type", "messageable_id"], name: "index_messages_on_messageable_type_and_messageable_id", using: :btree

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

  create_table "play_evolutions", force: :cascade do |t|
    t.string   "hash",          limit: 255, null: false
    t.datetime "applied_at",                null: false
    t.text     "apply_script"
    t.text     "revert_script"
    t.string   "state",         limit: 255
    t.text     "last_problem"
  end

  create_table "play_evolutions_lock", primary_key: "lock", force: :cascade do |t|
  end

  create_table "portfolios", force: :cascade do |t|
    t.string   "name"
    t.text     "description"
    t.string   "cover_photo"
    t.integer  "portfolioable_id"
    t.string   "portfolioable_type"
    t.datetime "created_at",         null: false
    t.datetime "updated_at",         null: false
  end

  create_table "prefer_vendors", force: :cascade do |t|
    t.integer  "company_id"
    t.integer  "vendor_id"
    t.integer  "status",     default: 0
    t.datetime "created_at",             null: false
    t.datetime "updated_at",             null: false
  end

  create_table "profile", id: :bigserial, force: :cascade do |t|
    t.text    "first_name",                                                  null: false
    t.text    "last_name",                                                   null: false
    t.text    "location",                                    default: "",    null: false
    t.string  "img_url",                         limit: 512
    t.text    "bio"
    t.text    "phone_number"
    t.boolean "phone_number_validated",                      default: false, null: false
    t.integer "phone_pin"
    t.integer "phone_validation_attempts_count",             default: 0,     null: false
    t.text    "status"
    t.text    "availability"
  end

  create_table "recruiter", id: :bigserial, force: :cascade do |t|
    t.integer "account_id",   limit: 8,                 null: false
    t.text    "curr_company",                           null: false
    t.boolean "has_logo",               default: false, null: false
    t.date    "added_on"
  end

  create_table "reminders", force: :cascade do |t|
    t.string   "title"
    t.datetime "remind_at"
    t.integer  "status",            default: 0
    t.integer  "user_id"
    t.integer  "reminderable_id"
    t.string   "reminderable_type"
    t.datetime "created_at",                    null: false
    t.datetime "updated_at",                    null: false
  end

  add_index "reminders", ["reminderable_type", "reminderable_id"], name: "index_reminders_on_reminderable_type_and_reminderable_id", using: :btree

  create_table "role", id: :bigserial, force: :cascade do |t|
    t.text "name", null: false
  end

  add_index "role", ["name"], name: "role_name_key", unique: true, using: :btree

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

  create_table "search_index_updates", id: :bigserial, force: :cascade do |t|
    t.integer  "maker_id",     limit: 8
    t.integer  "job_id",       limit: 8
    t.datetime "request_time",           default: "now()", null: false
  end

  create_table "sent_message", id: :bigserial, force: :cascade do |t|
    t.integer  "sender_id",   limit: 8,                   null: false
    t.integer  "receiver_id", limit: 8,                   null: false
    t.datetime "sent_at",               default: "now()", null: false
  end

  create_table "statuses", force: :cascade do |t|
    t.integer  "statusable_id"
    t.string   "statusable_type"
    t.integer  "user_id"
    t.string   "note"
    t.integer  "status_type"
    t.datetime "created_at",      null: false
    t.datetime "updated_at",      null: false
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

  create_table "user_social_profile", id: false, force: :cascade do |t|
    t.string   "provider",     limit: 64,  null: false
    t.text     "key",                      null: false
    t.string   "email",        limit: 256
    t.string   "first_name",   limit: 512
    t.string   "last_name",    limit: 512
    t.string   "full_name",    limit: 512
    t.string   "avatar_url",   limit: 512
    t.string   "curr_company", limit: 512
    t.string   "curr_title",   limit: 512
    t.integer  "account_id",   limit: 8
    t.datetime "created",                  null: false
    t.text     "bio"
    t.text     "location"
  end

  add_index "user_social_profile", ["email"], name: "user_social_profile_email_idx", using: :btree
  add_index "user_social_profile", ["provider", "key"], name: "user_social_profile_provider_key_idx", unique: true, using: :btree

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
    t.integer  "visa_status"
    t.date     "availability"
    t.integer  "relocation",             default: 0
  end

  add_index "users", ["deleted_at"], name: "index_users_on_deleted_at", using: :btree
  add_index "users", ["email"], name: "index_users_on_email", unique: true, using: :btree
  add_index "users", ["invitation_token"], name: "index_users_on_invitation_token", unique: true, using: :btree
  add_index "users", ["invitations_count"], name: "index_users_on_invitations_count", using: :btree
  add_index "users", ["invited_by_id"], name: "index_users_on_invited_by_id", using: :btree
  add_index "users", ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true, using: :btree

  add_foreign_key "account_properties", "account", name: "account_properties_account_id_fkey"
  add_foreign_key "connection", "account", column: "left_id", name: "connection_left_id_fkey", on_delete: :cascade
  add_foreign_key "connection", "account", column: "right_id", name: "connection_right_id_fkey", on_delete: :cascade
  add_foreign_key "connection_request", "account", column: "requestee_id", name: "connection_request_requestee_id_fkey", on_delete: :cascade
  add_foreign_key "connection_request", "account", column: "requestor_id", name: "connection_request_requestor_id_fkey", on_delete: :cascade
  add_foreign_key "credit_verification", "account", column: "user_id", name: "credit_verification_user_id_fkey", on_delete: :cascade
  add_foreign_key "credit_verification", "game_credit", column: "credit_id", name: "credit_verification_credit_id_fkey", on_delete: :cascade
  add_foreign_key "game_credit", "company", name: "game_credit_company_id_fkey"
  add_foreign_key "game_credit", "game", name: "game_credit_game_id_fkey"
  add_foreign_key "game_credit", "game_maker", column: "maker_id", name: "game_credit_maker_id_fkey", on_delete: :cascade
  add_foreign_key "game_credit", "role", name: "game_credit_role_id_fkey"
  add_foreign_key "game_image", "game", name: "game_image_game_id_fkey"
  add_foreign_key "game_maker", "account", name: "game_maker_account_id_fkey", on_delete: :cascade
  add_foreign_key "game_maker", "profile", column: "id", name: "game_maker_id_fkey", on_delete: :cascade
  add_foreign_key "job_application", "game_maker", column: "applicant_id", name: "job_application_applicant_id_fkey", on_delete: :cascade
  add_foreign_key "job_application", "job_card", column: "job_id", name: "job_application_job_id_fkey", on_delete: :cascade
  add_foreign_key "job_card", "company", name: "job_card_company_id_fkey"
  add_foreign_key "job_card", "recruiter", column: "owner_id", name: "job_card_owner_id_fkey", on_delete: :cascade
  add_foreign_key "job_card", "role", name: "job_card_role_id_fkey"
  add_foreign_key "recruiter", "account", name: "recruiter_account_id_fkey", on_delete: :cascade
  add_foreign_key "recruiter", "profile", column: "id", name: "recruiter_id_fkey", on_delete: :cascade
  add_foreign_key "search_index_updates", "game_maker", column: "maker_id", name: "search_index_updates_maker_id_fkey", on_delete: :cascade
  add_foreign_key "search_index_updates", "job_card", column: "job_id", name: "search_index_updates_job_id_fkey", on_delete: :cascade
  add_foreign_key "sent_message", "account", column: "receiver_id", name: "sent_message_receiver_id_fkey", on_delete: :cascade
  add_foreign_key "sent_message", "account", column: "sender_id", name: "sent_message_sender_id_fkey", on_delete: :cascade
  add_foreign_key "user_social_profile", "account", name: "user_social_profile_account_id_fkey"
end
