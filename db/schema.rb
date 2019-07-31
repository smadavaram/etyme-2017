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

ActiveRecord::Schema.define(version: 20190731101337) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"
  enable_extension "hstore"

  create_table "active_admin_comments", id: :serial, force: :cascade do |t|
    t.string "namespace"
    t.text "body"
    t.integer "resource_id"
    t.string "resource_type"
    t.integer "author_id"
    t.string "author_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_type", "author_id"], name: "index_active_admin_comments_on_author_type_and_author_id"
    t.index ["namespace"], name: "index_active_admin_comments_on_namespace"
    t.index ["resource_type", "resource_id"], name: "index_active_admin_comments_on_resource_type_and_resource_id"
  end

  create_table "activities", id: :serial, force: :cascade do |t|
    t.string "trackable_type"
    t.integer "trackable_id"
    t.string "owner_type"
    t.integer "owner_id"
    t.string "key"
    t.text "parameters"
    t.string "recipient_type"
    t.integer "recipient_id"
    t.datetime "created_at"
    t.datetime "updated_at"
    t.string "additional_data"
    t.index ["owner_id", "owner_type"], name: "index_activities_on_owner_id_and_owner_type"
    t.index ["recipient_id", "recipient_type"], name: "index_activities_on_recipient_id_and_recipient_type"
    t.index ["trackable_id", "trackable_type"], name: "index_activities_on_trackable_id_and_trackable_type"
  end

  create_table "addresses", id: :serial, force: :cascade do |t|
    t.string "address_1"
    t.string "address_2"
    t.string "country"
    t.string "city"
    t.string "state"
    t.string "zip_code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.date "from_date"
    t.date "to_date"
    t.string "addressable_type"
    t.bigint "addressable_id"
    t.index ["addressable_type", "addressable_id"], name: "index_addresses_on_addressable_type_and_addressable_id"
  end

  create_table "admin_users", id: :serial, force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer "sign_in_count", default: 0, null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.inet "current_sign_in_ip"
    t.inet "last_sign_in_ip"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_admin_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_admin_users_on_reset_password_token", unique: true
  end

  create_table "attachable_docs", id: :serial, force: :cascade do |t|
    t.integer "company_doc_id"
    t.string "orignal_file"
    t.string "documentable_type"
    t.integer "documentable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file"
    t.index ["company_doc_id"], name: "index_attachable_docs_on_company_doc_id"
    t.index ["documentable_type", "documentable_id"], name: "index_attachable_docs_on_documentable_type_and_documentable_id"
  end

  create_table "attachments", id: :serial, force: :cascade do |t|
    t.string "file"
    t.string "file_name"
    t.integer "file_size"
    t.string "file_type"
    t.string "attachable_type"
    t.integer "attachable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_id"
  end

  create_table "bank_details", force: :cascade do |t|
    t.string "company_id"
    t.string "bank_name"
    t.string "balance"
    t.string "new_balance"
    t.date "recon_date"
    t.string "unidentified_bal"
    t.string "current_unidentified_bal"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "billing_infos", force: :cascade do |t|
    t.bigint "company_id"
    t.string "address"
    t.string "city"
    t.string "country"
    t.string "zip"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_id"], name: "index_billing_infos_on_company_id"
  end

  create_table "black_listers", force: :cascade do |t|
    t.bigint "company_id"
    t.integer "status", default: 0
    t.string "blacklister_type"
    t.bigint "blacklister_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["blacklister_type", "blacklister_id"], name: "index_black_listers_on_blacklister_type_and_blacklister_id"
  end

  create_table "branches", force: :cascade do |t|
    t.bigint "company_id"
    t.string "branch_name"
    t.string "address"
    t.string "city"
    t.string "country"
    t.string "zip"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_id"], name: "index_branches_on_company_id"
  end

  create_table "buy_contracts", force: :cascade do |t|
    t.string "number"
    t.bigint "contract_id"
    t.integer "candidate_id"
    t.text "encrypted_ssn"
    t.string "contract_type"
    t.decimal "payrate"
    t.string "payrate_type"
    t.string "time_sheet"
    t.string "payment_term"
    t.boolean "show_accounting_to_employee"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.date "first_date_of_timesheet"
    t.date "first_date_of_invoice"
    t.date "ts_date_1"
    t.date "ts_date_2"
    t.boolean "ts_end_of_month", default: false
    t.string "ts_day_of_week"
    t.integer "max_day_allow_for_timesheet"
    t.integer "max_day_allow_for_invoice"
    t.integer "uscis_rate"
    t.integer "company_id"
    t.time "ts_day_time"
    t.date "pr_start_date"
    t.date "pr_end_date"
    t.string "ts_approve"
    t.time "ta_day_time"
    t.date "ta_date_1"
    t.date "ta_date_2"
    t.boolean "ta_end_of_month", default: false
    t.string "ta_day_of_week"
    t.string "salary_calculation"
    t.time "sc_day_time"
    t.date "sc_date_1"
    t.date "sc_date_2"
    t.boolean "sc_end_of_month", default: false
    t.string "sc_day_of_week"
    t.integer "commission_payment_term"
    t.string "invoice_recepit"
    t.time "ir_day_time"
    t.date "ir_date_1"
    t.date "ir_date_2"
    t.boolean "ir_end_of_month", default: false
    t.string "ir_day_of_week"
    t.date "payroll_date"
    t.string "vendor_bill"
    t.time "vb_day_time"
    t.date "vb_date_1"
    t.date "vb_date_2"
    t.string "vb_day_of_week"
    t.boolean "vb_end_of_month", default: false
    t.string "client_bill"
    t.time "cb_day_time"
    t.date "cb_date_1"
    t.date "cb_date_2"
    t.string "cb_day_of_week"
    t.boolean "cb_end_of_month", default: false
    t.string "client_bill_payment"
    t.time "cp_day_time"
    t.date "cp_date_1"
    t.date "cp_date_2"
    t.string "cp_day_of_week"
    t.boolean "cp_end_of_month", default: false
    t.integer "client_bill_payment_term"
    t.string "salary_process"
    t.time "sp_day_time"
    t.date "sp_date_1"
    t.date "sp_date_2"
    t.string "sp_day_of_week"
    t.boolean "sp_end_of_month", default: false
    t.string "salary_clear"
    t.time "sclr_day_time"
    t.date "sclr_date_1"
    t.date "sclr_date_2"
    t.string "sclr_day_of_week"
    t.boolean "sclr_end_of_month", default: false
    t.string "commission_calculation"
    t.time "com_cal_day_time"
    t.date "com_cal_date_1"
    t.date "com_cal_date_2"
    t.string "com_cal_day_of_week"
    t.boolean "com_cal_end_of_month", default: false
    t.string "commission_process"
    t.time "com_pro_day_time"
    t.date "com_pro_date_1"
    t.date "com_pro_date_2"
    t.string "com_pro_day_of_week"
    t.boolean "com_pro_end_of_month", default: false
    t.string "term_no"
    t.string "term_no_2"
    t.string "payment_term_2"
    t.string "vendor_clear"
    t.date "ven_clr_date_1"
    t.date "ven_clr_date_2"
    t.string "ven_clr_day_of_week"
    t.boolean "ven_clr_end_of_month"
    t.time "ven_clr_day_time"
    t.string "ven_term_1"
    t.string "ven_term_2"
    t.string "ven_term_num_1"
    t.string "ven_term_num_2"
    t.index ["candidate_id"], name: "index_buy_contracts_on_candidate_id"
    t.index ["contract_id"], name: "index_buy_contracts_on_contract_id"
  end

  create_table "buy_emp_req_docs", force: :cascade do |t|
    t.bigint "buy_contract_id"
    t.string "number"
    t.string "doc_file"
    t.date "when_expire"
    t.boolean "is_sign_required", default: false
    t.string "creatable_type"
    t.bigint "creatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file_name"
    t.integer "file_size"
    t.integer "file_type"
    t.index ["buy_contract_id"], name: "index_buy_emp_req_docs_on_buy_contract_id"
    t.index ["creatable_type", "creatable_id"], name: "index_buy_emp_req_docs_on_creatable_type_and_creatable_id"
  end

  create_table "buy_send_documents", force: :cascade do |t|
    t.bigint "buy_contract_id"
    t.string "number"
    t.string "doc_file"
    t.date "when_expire"
    t.boolean "is_sign_required", default: false
    t.string "creatable_type"
    t.bigint "creatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file_name"
    t.integer "file_size"
    t.integer "file_type"
    t.index ["buy_contract_id"], name: "index_buy_send_documents_on_buy_contract_id"
    t.index ["creatable_type", "creatable_id"], name: "index_buy_send_documents_on_creatable_type_and_creatable_id"
  end

  create_table "buy_ven_req_docs", force: :cascade do |t|
    t.bigint "buy_contract_id"
    t.string "number"
    t.string "doc_file"
    t.date "when_expire"
    t.boolean "is_sign_required", default: false
    t.string "creatable_type"
    t.bigint "creatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file_name"
    t.integer "file_size"
    t.integer "file_type"
    t.index ["buy_contract_id"], name: "index_buy_ven_req_docs_on_buy_contract_id"
    t.index ["creatable_type", "creatable_id"], name: "index_buy_ven_req_docs_on_creatable_type_and_creatable_id"
  end

  create_table "candidate_certificate_documents", force: :cascade do |t|
    t.integer "certificate_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "candidate_education_documents", force: :cascade do |t|
    t.integer "education_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "candidates", id: :serial, force: :cascade do |t|
    t.string "first_name", default: ""
    t.string "last_name", default: ""
    t.integer "gender"
    t.string "email", default: "", null: false
    t.string "phone"
    t.string "time_zone"
    t.integer "primary_address_id"
    t.string "photo"
    t.json "signature"
    t.integer "status", default: 0
    t.date "dob"
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer "sign_in_count", default: 0, null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "last_sign_in_ip"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "confirmation_sent_at"
    t.string "unconfirmed_email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "invitation_token"
    t.datetime "invitation_created_at"
    t.datetime "invitation_sent_at"
    t.datetime "invitation_accepted_at"
    t.integer "invitation_limit"
    t.string "invited_by_type"
    t.integer "invited_by_id"
    t.integer "invitations_count", default: 0
    t.string "resume"
    t.string "skills"
    t.string "description"
    t.integer "visa"
    t.string "location"
    t.string "video"
    t.string "category"
    t.string "subcategory"
    t.string "dept_name"
    t.string "industry_name"
    t.string "video_type"
    t.string "chat_status"
    t.boolean "is_number_verify", default: false
    t.boolean "is_personal_info_update", default: false
    t.boolean "is_social_media", default: false
    t.boolean "is_education_detail_update", default: false
    t.boolean "is_skill_update", default: false
    t.boolean "is_client_info_update", default: false
    t.boolean "is_designate_update", default: false
    t.boolean "is_documents_submit", default: false
    t.boolean "is_profile_active", default: false
    t.string "selected_from_resume"
    t.string "ever_worked_with_company"
    t.string "designation_status"
    t.string "candidate_visa"
    t.string "candidate_title"
    t.string "candidate_roal"
    t.string "facebook_url"
    t.string "twitter_url"
    t.string "linkedin_url"
    t.string "skypeid"
    t.string "gtalk_url"
    t.string "address"
    t.bigint "company_id"
    t.string "passport_number"
    t.string "ssn"
    t.boolean "relocation", default: false
    t.string "work_authorization"
    t.string "visa_type"
    t.index ["invitation_token"], name: "index_candidates_on_invitation_token", unique: true
    t.index ["invitations_count"], name: "index_candidates_on_invitations_count"
    t.index ["invited_by_id"], name: "index_candidates_on_invited_by_id"
    t.index ["reset_password_token"], name: "index_candidates_on_reset_password_token", unique: true
  end

  create_table "candidates_companies", force: :cascade do |t|
    t.integer "candidate_id"
    t.integer "company_id"
    t.integer "status", default: 0
    t.integer "candidate_status", default: 0
  end

  create_table "candidates_groups", id: false, force: :cascade do |t|
    t.integer "group_id"
    t.integer "candidate_id"
    t.index ["candidate_id"], name: "index_candidates_groups_on_candidate_id"
    t.index ["group_id"], name: "index_candidates_groups_on_group_id"
  end

  create_table "candidates_resumes", force: :cascade do |t|
    t.integer "candidate_id"
    t.string "resume"
    t.boolean "is_primary", default: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "certificates", force: :cascade do |t|
    t.bigint "candidate_id"
    t.string "title"
    t.string "institute"
    t.date "start_date"
    t.date "end_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id"], name: "index_certificates_on_candidate_id"
  end

  create_table "change_rates", force: :cascade do |t|
    t.integer "contract_id"
    t.date "from_date"
    t.date "to_date"
    t.string "rate_type"
    t.float "rate"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "chat_users", id: :serial, force: :cascade do |t|
    t.integer "chat_id"
    t.integer "status"
    t.string "userable_type"
    t.integer "userable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["chat_id", "userable_id", "userable_type"], name: "index_chat_users_on_chat_id_and_userable_id_and_userable_type", unique: true
    t.index ["userable_type", "userable_id"], name: "index_chat_users_on_userable_type_and_userable_id"
  end

  create_table "chats", id: :serial, force: :cascade do |t|
    t.string "slug"
    t.string "chatable_type"
    t.integer "chatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_id"
    t.index ["chatable_type", "chatable_id"], name: "index_chats_on_chatable_type_and_chatable_id"
  end

  create_table "client_bills", force: :cascade do |t|
    t.integer "cb_cal_cycle_id"
    t.integer "cp_pro_cycle_id"
    t.integer "cb_clr_cycle_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "client_expenses", force: :cascade do |t|
    t.integer "job_id"
    t.integer "user_id"
    t.integer "company_id"
    t.integer "contract_id"
    t.integer "status", default: 0
    t.float "amount"
    t.date "start_date"
    t.date "end_date"
    t.date "submitted_date"
    t.integer "candidate_id"
    t.integer "ce_cycle_id"
    t.integer "ce_ap_cycle_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "ce_in_cycle_id"
    t.index ["job_id"], name: "index_client_expenses_on_job_id"
  end

  create_table "clients", force: :cascade do |t|
    t.bigint "candidate_id"
    t.string "name"
    t.string "industry"
    t.date "start_date"
    t.date "end_date"
    t.string "project_description"
    t.string "role"
    t.string "refrence_name"
    t.string "refrence_phone"
    t.string "refrence_email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "refrence_two_name"
    t.string "refrence_two_email"
    t.string "refrence_two_phone"
    t.boolean "refrence_one"
    t.boolean "refrence_two"
    t.string "slug_one"
    t.string "slug_two"
    t.index ["candidate_id"], name: "index_clients_on_candidate_id"
  end

  create_table "comments", id: :serial, force: :cascade do |t|
    t.string "body"
    t.integer "commentable_id"
    t.string "commentable_type"
    t.integer "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_comments_on_created_by_id"
  end

  create_table "companies", id: :serial, force: :cascade do |t|
    t.integer "owner_id"
    t.string "name"
    t.string "website"
    t.string "logo"
    t.text "description"
    t.string "phone"
    t.string "email"
    t.string "slug"
    t.string "tag_line"
    t.string "linkedin_url"
    t.string "facebook_url"
    t.string "twitter_url"
    t.string "google_url"
    t.string "time_zone"
    t.boolean "is_activated", default: false
    t.string "dba"
    t.integer "status"
    t.date "established_date"
    t.integer "entity_type"
    t.integer "hr_manager_id"
    t.integer "billing_contact_id"
    t.string "accountant_contact_email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_type"
    t.integer "currency_id"
    t.string "domain"
    t.string "video"
    t.string "company_file"
    t.string "video_type"
    t.string "company_sub_type"
    t.string "fax_number"
    t.boolean "owner_verified", default: false
    t.string "verification_code"
    t.boolean "is_number_verify", default: false
    t.index ["owner_id"], name: "index_companies_on_owner_id"
  end

  create_table "company_candidate_docs", force: :cascade do |t|
    t.integer "company_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.boolean "is_required_signature", default: false
    t.integer "created_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title_type"
    t.string "is_require"
    t.string "document_for"
  end

  create_table "company_contacts", id: :serial, force: :cascade do |t|
    t.integer "company_id"
    t.string "first_name"
    t.string "last_name"
    t.string "email", default: "", null: false
    t.string "phone"
    t.integer "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title"
    t.string "photo"
    t.string "department"
    t.bigint "user_id"
    t.bigint "user_company_id"
    t.bigint "created_by_id"
    t.index ["company_id", "email"], name: "index_company_contacts_on_company_id_and_email", unique: true
  end

  create_table "company_customer_docs", force: :cascade do |t|
    t.integer "company_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.boolean "is_required_signature"
    t.integer "created_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title_type"
    t.string "is_require"
  end

  create_table "company_departments", force: :cascade do |t|
    t.bigint "company_id"
    t.bigint "department_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_id"], name: "index_company_departments_on_company_id"
    t.index ["department_id"], name: "index_company_departments_on_department_id"
  end

  create_table "company_docs", id: :serial, force: :cascade do |t|
    t.string "name"
    t.integer "doc_type"
    t.integer "created_by"
    t.integer "company_id"
    t.string "file"
    t.boolean "is_required_signature"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "company_employee_docs", force: :cascade do |t|
    t.integer "company_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.boolean "is_required_signature"
    t.integer "created_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title_type"
    t.string "is_require"
  end

  create_table "company_legal_docs", force: :cascade do |t|
    t.integer "company_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.string "custome_name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "company_vendor_docs", force: :cascade do |t|
    t.integer "company_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.boolean "is_required_signature", default: false
    t.integer "created_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "title_type"
    t.string "is_require"
  end

  create_table "company_videos", force: :cascade do |t|
    t.integer "company_id"
    t.string "video"
    t.string "video_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "consultant_profiles", id: :serial, force: :cascade do |t|
    t.integer "consultant_id"
    t.string "designation"
    t.date "joining_date"
    t.integer "location_id"
    t.integer "employment_type"
    t.integer "salary_type"
    t.float "salary"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["consultant_id"], name: "index_consultant_profiles_on_consultant_id"
  end

  create_table "contract_buy_business_details", force: :cascade do |t|
    t.bigint "buy_contract_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_contact_id"
    t.index ["buy_contract_id"], name: "index_contract_buy_business_details_on_buy_contract_id"
  end

  create_table "contract_customer_rate_histories", force: :cascade do |t|
    t.bigint "sell_contract_id"
    t.decimal "customer_rate"
    t.date "change_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["sell_contract_id"], name: "index_contract_customer_rate_histories_on_sell_contract_id"
  end

  create_table "contract_cycles", force: :cascade do |t|
    t.bigint "contract_id"
    t.bigint "company_id"
    t.bigint "candidate_id"
    t.text "note"
    t.string "cycle_type"
    t.datetime "cycle_date"
    t.string "cyclable_type"
    t.bigint "cyclable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "status", default: "pending"
    t.datetime "completed_at"
    t.datetime "start_date"
    t.datetime "end_date"
    t.datetime "next_date"
    t.string "next_action"
    t.datetime "next_action_date"
    t.date "doc_date"
    t.date "post_date"
    t.index ["candidate_id"], name: "index_contract_cycles_on_candidate_id"
    t.index ["company_id"], name: "index_contract_cycles_on_company_id"
    t.index ["contract_id"], name: "index_contract_cycles_on_contract_id"
    t.index ["cyclable_type", "cyclable_id"], name: "index_contract_cycles_on_cyclable_type_and_cyclable_id"
  end

  create_table "contract_expense_types", force: :cascade do |t|
    t.string "name"
    t.integer "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "contract_expenses", force: :cascade do |t|
    t.integer "contract_id"
    t.integer "expense_type_id"
    t.integer "cycle_id"
    t.integer "candidate_id"
    t.float "amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "con_ex_type"
  end

  create_table "contract_salary_histories", force: :cascade do |t|
    t.bigint "contract_id"
    t.bigint "company_id"
    t.bigint "candidate_id"
    t.decimal "amount"
    t.decimal "final_amount"
    t.text "description"
    t.string "salary_type"
    t.string "salable_type"
    t.bigint "salable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id"], name: "index_contract_salary_histories_on_candidate_id"
    t.index ["company_id"], name: "index_contract_salary_histories_on_company_id"
    t.index ["contract_id"], name: "index_contract_salary_histories_on_contract_id"
    t.index ["salable_type", "salable_id"], name: "index_contract_salary_histories_on_salable_type_and_salable_id"
  end

  create_table "contract_sale_commisions", force: :cascade do |t|
    t.bigint "buy_contract_id"
    t.string "name"
    t.decimal "rate"
    t.string "frequency"
    t.decimal "limit"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "com_cal_cycle_id"
    t.integer "com_pro_cycle_id"
    t.integer "com_clr_cycle_id"
    t.index ["buy_contract_id"], name: "index_contract_sale_commisions_on_buy_contract_id"
  end

  create_table "contract_sell_business_details", force: :cascade do |t|
    t.bigint "sell_contract_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_contact_id"
    t.index ["sell_contract_id"], name: "index_contract_sell_business_details_on_sell_contract_id"
  end

  create_table "contract_terms", id: :serial, force: :cascade do |t|
    t.decimal "rate"
    t.text "note"
    t.text "terms_condition"
    t.integer "created_by"
    t.integer "status", default: 0
    t.integer "contract_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by"], name: "index_contract_terms_on_created_by"
  end

  create_table "contracts", id: :serial, force: :cascade do |t|
    t.integer "job_application_id"
    t.integer "job_id"
    t.date "start_date"
    t.date "end_date"
    t.string "message_from_hiring"
    t.string "response_from_vendor"
    t.integer "created_by_id"
    t.integer "respond_by_id"
    t.string "responed_at"
    t.integer "status", default: 0
    t.integer "assignee_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "billing_frequency"
    t.integer "time_sheet_frequency"
    t.integer "company_id"
    t.date "next_invoice_date"
    t.boolean "is_commission", default: false
    t.integer "commission_type"
    t.float "commission_amount", default: 0.0
    t.float "max_commission"
    t.integer "commission_for_id"
    t.json "received_by_signature"
    t.string "received_by_name"
    t.json "sent_by_signature"
    t.string "sent_by_name"
    t.integer "contractable_id"
    t.string "contractable_type"
    t.integer "parent_contract_id"
    t.integer "contract_type"
    t.string "work_location"
    t.integer "candidate_id"
    t.integer "client_id"
    t.string "number"
    t.decimal "salary_to_pay", default: "0.0"
    t.string "project_name"
    t.boolean "is_client_customer"
  end

  create_table "conversation_messages", force: :cascade do |t|
    t.text "body"
    t.boolean "is_read", default: false
    t.bigint "conversation_id"
    t.string "userable_type"
    t.bigint "userable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "attachment_file"
    t.string "file_name"
    t.string "file_size"
    t.string "file_type"
    t.string "file_url"
    t.integer "message_type"
    t.bigint "resource_id"
    t.index ["conversation_id"], name: "index_conversation_messages_on_conversation_id"
    t.index ["userable_type", "userable_id"], name: "index_conversation_messages_on_userable_type_and_userable_id"
  end

  create_table "conversation_mutes", force: :cascade do |t|
    t.bigint "conversation_id"
    t.string "mutable_type"
    t.bigint "mutable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_id"], name: "index_conversation_mutes_on_conversation_id"
    t.index ["mutable_type", "mutable_id"], name: "index_conversation_mutes_on_mutable_type_and_mutable_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.string "senderable_type"
    t.bigint "senderable_id"
    t.string "recipientable_type"
    t.bigint "recipientable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "topic", default: 0
    t.string "chatable_type"
    t.bigint "chatable_id"
    t.bigint "job_application_id"
    t.bigint "job_id"
    t.index ["chatable_type", "chatable_id"], name: "index_conversations_on_chatable_type_and_chatable_id"
    t.index ["recipientable_type", "recipientable_id"], name: "index_conversations_on_recipientable_type_and_recipientable_id"
    t.index ["senderable_type", "senderable_id"], name: "index_conversations_on_senderable_type_and_senderable_id"
  end

  create_table "criminal_checks", force: :cascade do |t|
    t.integer "candidate_id"
    t.string "state"
    t.string "address"
    t.date "start_date"
    t.date "end_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "csc_accounts", force: :cascade do |t|
    t.bigint "contract_sale_commision_id"
    t.string "accountable_type"
    t.bigint "accountable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "total_amount", default: "0.0"
    t.integer "contract_id"
    t.index ["accountable_type", "accountable_id"], name: "index_csc_accounts_on_accountable_type_and_accountable_id"
    t.index ["contract_sale_commision_id"], name: "index_csc_accounts_on_contract_sale_commision_id"
  end

  create_table "currencies", id: :serial, force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "custom_fields", id: :serial, force: :cascade do |t|
    t.string "name"
    t.string "value"
    t.integer "status"
    t.integer "customizable_id"
    t.string "customizable_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "required", default: false
  end

  create_table "delayed_jobs", id: :serial, force: :cascade do |t|
    t.integer "priority", default: 0, null: false
    t.integer "attempts", default: 0, null: false
    t.text "handler", null: false
    t.text "last_error"
    t.datetime "run_at"
    t.datetime "locked_at"
    t.datetime "failed_at"
    t.string "locked_by"
    t.string "queue"
    t.datetime "created_at"
    t.datetime "updated_at"
    t.index ["priority", "run_at"], name: "delayed_jobs_priority"
  end

  create_table "departments", force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "designations", force: :cascade do |t|
    t.bigint "candidate_id"
    t.string "comp_name"
    t.string "recruiter_name"
    t.string "recruiter_phone"
    t.string "recruiter_email"
    t.string "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "company_role"
    t.date "start_date"
    t.date "end_date"
    t.integer "confirmation", default: 0
    t.index ["candidate_id"], name: "index_designations_on_candidate_id"
  end

  create_table "document_signs", force: :cascade do |t|
    t.string "documentable_type"
    t.bigint "documentable_id"
    t.string "signable_type"
    t.bigint "signable_id"
    t.boolean "is_sign_done", default: false
    t.datetime "sign_time"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "company_id"
    t.string "envelope_id"
    t.string "envelope_uri"
    t.string "signed_file"
    t.string "initiator_type"
    t.bigint "initiator_id"
    t.index ["documentable_type", "documentable_id"], name: "index_document_signs_on_documentable_type_and_documentable_id"
    t.index ["signable_type", "signable_id"], name: "index_document_signs_on_signable_type_and_signable_id"
  end

  create_table "documents", force: :cascade do |t|
    t.integer "candidate_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.boolean "is_education", default: false
    t.boolean "is_legal_doc", default: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "docusigns", force: :cascade do |t|
    t.string "ds_expires_at"
    t.string "ds_user_name"
    t.string "ds_access_token"
    t.string "ds_refresh_token"
    t.string "ds_account_id"
    t.string "ds_account_name"
    t.string "ds_base_path"
    t.integer "company_id"
  end

  create_table "educations", id: :serial, force: :cascade do |t|
    t.string "degree_title"
    t.string "grade"
    t.date "completion_year"
    t.date "start_year"
    t.string "institute"
    t.integer "status"
    t.text "description"
    t.integer "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "degree_level"
  end

  create_table "expense_accounts", force: :cascade do |t|
    t.text "description"
    t.integer "status"
    t.string "amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "payment"
    t.integer "balance_due"
    t.string "check_no"
    t.integer "expense_type_id"
    t.bigint "expense_id"
    t.index ["expense_id"], name: "index_expense_accounts_on_expense_id"
  end

  create_table "expense_types", force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "expenses", force: :cascade do |t|
    t.integer "contract_id"
    t.integer "account_id"
    t.text "mailing_address"
    t.string "terms"
    t.date "bill_date"
    t.date "due_date"
    t.string "bill_no"
    t.string "total_amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "bill_type"
    t.text "ce_ap_cycle_id"
    t.integer "ce_in_cycle_id"
    t.integer "status"
    t.string "attachment"
    t.text "salary_ids"
  end

  create_table "experiences", id: :serial, force: :cascade do |t|
    t.string "experience_title"
    t.date "start_date"
    t.date "end_date"
    t.string "institute"
    t.integer "status"
    t.text "description"
    t.integer "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "industry"
    t.string "department"
  end

  create_table "favourite_chats", force: :cascade do |t|
    t.string "favourable_type"
    t.bigint "favourable_id"
    t.string "favourabled_type"
    t.bigint "favourabled_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["favourable_type", "favourable_id"], name: "index_favourite_chats_on_favourable_type_and_favourable_id"
    t.index ["favourabled_type", "favourabled_id"], name: "index_favourite_chats_on_favourabled_type_and_favourabled_id"
  end

  create_table "group_msg_notifies", force: :cascade do |t|
    t.bigint "group_id"
    t.bigint "conversation_message_id"
    t.string "member_type"
    t.bigint "member_id"
    t.boolean "is_read", default: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_message_id"], name: "index_group_msg_notifies_on_conversation_message_id"
    t.index ["group_id"], name: "index_group_msg_notifies_on_group_id"
    t.index ["member_type", "member_id"], name: "index_group_msg_notifies_on_member_type_and_member_id"
  end

  create_table "groupables", id: :serial, force: :cascade do |t|
    t.integer "group_id"
    t.string "groupable_type"
    t.integer "groupable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["groupable_type", "groupable_id"], name: "index_groupables_on_groupable_type_and_groupable_id"
  end

  create_table "groups", id: :serial, force: :cascade do |t|
    t.string "group_name"
    t.integer "company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "member_type"
    t.index ["company_id"], name: "index_groups_on_company_id"
  end

  create_table "interviews", force: :cascade do |t|
    t.string "date"
    t.string "time"
    t.bigint "job_application_id"
    t.string "source"
    t.string "location"
    t.boolean "accept", default: false
    t.boolean "accepted_by_recruiter", default: false
    t.boolean "accepted_by_company", default: false
  end

  create_table "invited_companies", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "invited_company_id"
    t.integer "invited_by_company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invited_by_company_id"], name: "index_invited_companies_on_invited_by_company_id"
    t.index ["invited_company_id"], name: "index_invited_companies_on_invited_company_id"
    t.index ["user_id"], name: "index_invited_companies_on_user_id"
  end

  create_table "invoice_infos", force: :cascade do |t|
    t.bigint "company_id"
    t.string "invoice_term"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_id"], name: "index_invoice_infos_on_company_id"
  end

  create_table "invoices", id: :serial, force: :cascade do |t|
    t.integer "contract_id"
    t.date "start_date"
    t.date "end_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "total_amount", default: "0.0"
    t.decimal "commission_amount", default: "0.0"
    t.decimal "billing_amount", default: "0.0"
    t.float "consultant_amount", default: 0.0
    t.integer "submitted_by"
    t.datetime "submitted_on"
    t.integer "status", default: 0
    t.integer "total_approve_time", default: 0
    t.integer "parent_id"
    t.decimal "rate", default: "0.0"
    t.integer "ig_cycle_id"
    t.string "number"
    t.decimal "balance", default: "0.0"
    t.integer "invoice_type"
  end

  create_table "job_applicant_reqs", force: :cascade do |t|
    t.bigint "job_application_id"
    t.bigint "job_requirement_id"
    t.text "applicant_ans"
    t.string "app_multi_ans"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["job_application_id"], name: "index_job_applicant_reqs_on_job_application_id"
    t.index ["job_requirement_id"], name: "index_job_applicant_reqs_on_job_requirement_id"
  end

  create_table "job_application_with_recruiters", force: :cascade do |t|
    t.string "first_name"
    t.string "last_name"
    t.string "email"
    t.string "phone"
    t.string "location"
    t.string "skill"
    t.string "visa"
    t.string "title"
    t.string "roal"
    t.string "resume"
    t.integer "job_application_id"
    t.boolean "is_registerd"
    t.string "recruiter_email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "job_application_without_registrations", force: :cascade do |t|
    t.string "first_name"
    t.string "last_name"
    t.string "email"
    t.string "phone"
    t.string "location"
    t.string "skill"
    t.string "visa"
    t.string "title"
    t.string "roal"
    t.string "resume"
    t.integer "job_application_id"
    t.boolean "is_registerd"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "job_applications", id: :serial, force: :cascade do |t|
    t.integer "job_invitation_id"
    t.text "cover_letter"
    t.string "message"
    t.integer "status", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "job_id"
    t.integer "application_type"
    t.integer "company_id"
    t.integer "applicationable_id"
    t.string "applicationable_type"
    t.string "applicant_resume"
    t.string "share_key"
    t.string "available_from"
    t.string "available_to"
    t.datetime "available_to_join"
    t.float "total_experience"
    t.float "relevant_experience"
    t.float "rate_per_hour"
    t.string "rate_initiator"
    t.boolean "accept_rate", default: false
    t.boolean "accept_rate_by_company", default: false
  end

  create_table "job_invitations", id: :serial, force: :cascade do |t|
    t.integer "recipient_id"
    t.string "email"
    t.string "recipient_type"
    t.integer "created_by_id"
    t.integer "job_id"
    t.integer "status", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.date "expiry"
    t.string "message"
    t.integer "company_id"
    t.integer "invitation_type"
    t.text "response_message"
  end

  create_table "job_requirements", force: :cascade do |t|
    t.bigint "job_id"
    t.text "questions"
    t.string "ans_type"
    t.boolean "ans_mandatroy"
    t.boolean "multiple_ans"
    t.string "multiple_option"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["job_id"], name: "index_job_requirements_on_job_id"
  end

  create_table "jobs", id: :serial, force: :cascade do |t|
    t.string "title"
    t.text "description"
    t.string "location"
    t.date "start_date"
    t.date "end_date"
    t.integer "parent_job_id"
    t.integer "company_id"
    t.integer "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "is_public", default: true
    t.string "job_category"
    t.boolean "is_system_generated", default: false
    t.datetime "deleted_at"
    t.string "video_file"
    t.string "industry"
    t.string "department"
    t.decimal "price"
    t.string "job_type"
    t.integer "ref_job_id"
    t.boolean "is_bench_job"
    t.string "comp_video"
    t.string "listing_type", default: "Job"
    t.string "status"
    t.string "media_type"
    t.bigint "conversation_id"
    t.string "source"
    t.boolean "is_indexed", default: false
    t.index ["deleted_at"], name: "index_jobs_on_deleted_at"
  end

  create_table "leaves", id: :serial, force: :cascade do |t|
    t.date "from_date"
    t.date "till_date"
    t.string "reason"
    t.string "response_message"
    t.integer "status", default: 0
    t.string "leave_type"
    t.integer "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "legal_documents", force: :cascade do |t|
    t.integer "candidate_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "document_number"
    t.date "start_date"
  end

  create_table "locations", id: :serial, force: :cascade do |t|
    t.string "name"
    t.integer "address_id"
    t.integer "company_id"
    t.integer "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "messages", id: :serial, force: :cascade do |t|
    t.string "body"
    t.integer "chat_id"
    t.string "messageable_type"
    t.integer "messageable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "company_doc_id"
    t.integer "file_status", default: 0
    t.index ["messageable_type", "messageable_id"], name: "index_messages_on_messageable_type_and_messageable_id"
  end

  create_table "notifications", id: :serial, force: :cascade do |t|
    t.integer "notifiable_id"
    t.string "notifiable_type"
    t.text "message"
    t.integer "status", default: 0
    t.string "title"
    t.integer "notification_type", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "createable_type"
    t.bigint "createable_id"
  end

  create_table "packages", id: :serial, force: :cascade do |t|
    t.string "name"
    t.text "description"
    t.integer "duration"
    t.float "price"
    t.string "slug"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "payroll_infos", force: :cascade do |t|
    t.bigint "company_id"
    t.string "payroll_term"
    t.string "payroll_type"
    t.date "sal_cal_date"
    t.date "payroll_date"
    t.string "weekend_sch"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.time "scal_day_time"
    t.date "scal_date_1"
    t.date "scal_date_2"
    t.string "scal_day_of_week"
    t.boolean "scal_end_of_month", default: false
    t.time "sp_day_time"
    t.date "sp_date_1"
    t.date "sp_date_2"
    t.string "sp_day_of_week"
    t.boolean "sp_end_of_month", default: false
    t.time "sclr_day_time"
    t.date "sclr_date_1"
    t.date "sclr_date_2"
    t.string "sclr_day_of_week"
    t.boolean "sclr_end_of_month", default: false
    t.string "term_no"
    t.string "term_no_2"
    t.string "payroll_term_2"
    t.string "ven_term_no_1"
    t.string "ven_term_no_2"
    t.date "ven_bill_date_1"
    t.date "ven_bill_date_2"
    t.date "ven_pay_date_1"
    t.date "ven_pay_date_2"
    t.date "ven_clr_date_1"
    t.date "ven_clr_date_2"
    t.time "ven_bill_day_time"
    t.time "ven_pay_day_time"
    t.time "ven_clr_day_time"
    t.boolean "ven_bill_end_of_month"
    t.boolean "ven_pay_end_of_month"
    t.boolean "ven_clr_end_of_month"
    t.string "ven_payroll_type"
    t.string "ven_term_num_1"
    t.string "ven_term_num_2"
    t.string "ven_term_1"
    t.string "ven_term_2"
    t.string "ven_bill_day_of_week"
    t.string "ven_pay_day_of_week"
    t.string "ven_clr_day_of_week"
    t.index ["company_id"], name: "index_payroll_infos_on_company_id"
  end

  create_table "permissions", id: :serial, force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "permissions_roles", id: false, force: :cascade do |t|
    t.integer "role_id"
    t.integer "permission_id"
  end

  create_table "plugins", force: :cascade do |t|
    t.string "expires_at"
    t.string "user_name"
    t.string "access_token"
    t.string "refresh_token"
    t.string "account_id"
    t.string "account_name"
    t.string "base_path"
    t.integer "plugin_type"
    t.integer "company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "app_key"
    t.string "app_secret"
  end

  create_table "portfolios", id: :serial, force: :cascade do |t|
    t.string "name"
    t.text "description"
    t.string "cover_photo"
    t.string "portfolioable_type"
    t.integer "portfolioable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "prefer_vendors", id: :serial, force: :cascade do |t|
    t.integer "company_id"
    t.integer "vendor_id"
    t.integer "status", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "receive_payments", force: :cascade do |t|
    t.bigint "invoice_id"
    t.datetime "payment_date"
    t.string "payment_method"
    t.string "reference_no"
    t.string "deposit_to"
    t.decimal "amount_received", default: "0.0"
    t.text "memo"
    t.boolean "posted_as_discount", default: false
    t.string "attachment"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["invoice_id"], name: "index_receive_payments_on_invoice_id"
  end

  create_table "reminders", id: :serial, force: :cascade do |t|
    t.string "title"
    t.datetime "remind_at"
    t.integer "status", default: 0
    t.integer "user_id"
    t.string "reminderable_type"
    t.integer "reminderable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["reminderable_type", "reminderable_id"], name: "index_reminders_on_reminderable_type_and_reminderable_id"
  end

  create_table "roles", id: :serial, force: :cascade do |t|
    t.string "name"
    t.integer "company_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "roles_users", id: false, force: :cascade do |t|
    t.integer "role_id"
    t.integer "user_id"
  end

  create_table "salaries", force: :cascade do |t|
    t.integer "contract_id"
    t.integer "company_id"
    t.integer "candidate_id"
    t.date "start_date"
    t.date "end_date"
    t.integer "status"
    t.integer "sc_cycle_id"
    t.integer "sp_cycle_id"
    t.integer "sclr_cycle_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.decimal "total_amount", default: "0.0"
    t.decimal "commission_amount", default: "0.0"
    t.decimal "billing_amount", default: "0.0"
    t.integer "total_approve_time", default: 0
    t.decimal "rate", default: "0.0"
    t.decimal "balance", default: "0.0"
    t.float "pending_amount"
    t.float "salary_advance"
    t.float "approved_amount"
  end

  create_table "sell_contracts", force: :cascade do |t|
    t.string "number"
    t.bigint "contract_id"
    t.integer "company_id"
    t.decimal "customer_rate", default: "0.0"
    t.string "customer_rate_type"
    t.string "time_sheet"
    t.string "invoice_terms_period"
    t.boolean "show_accounting_to_employee"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.date "first_date_of_timesheet"
    t.date "first_date_of_invoice"
    t.date "ts_date_1"
    t.date "ts_date_2"
    t.boolean "ts_end_of_month", default: false
    t.string "ts_day_of_week"
    t.integer "max_day_allow_for_timesheet"
    t.integer "max_day_allow_for_invoice"
    t.date "invoice_date_1"
    t.date "invoice_date_2"
    t.boolean "invoice_end_of_month", default: false
    t.string "invoice_day_of_week", default: "f"
    t.decimal "payment_term", default: "0.0"
    t.time "ts_day_time"
    t.time "invoice_day_time"
    t.date "cr_start_date"
    t.date "cr_end_date"
    t.string "ts_approve"
    t.time "ta_day_time"
    t.date "ta_date_1"
    t.date "ta_date_2"
    t.boolean "ta_end_of_month", default: false
    t.string "ta_day_of_week"
    t.float "expected_hour", default: 0.0
    t.boolean "is_performance_review", default: false
    t.string "performance_review"
    t.time "pr_day_time"
    t.date "pr_date_1"
    t.date "pr_date_2"
    t.string "pr_day_of_week"
    t.boolean "pr_end_of_month", default: false
    t.boolean "is_client_expense", default: false
    t.string "client_expense"
    t.time "ce_day_time"
    t.date "ce_date_1"
    t.date "ce_date_2"
    t.string "ce_day_of_week"
    t.boolean "ce_end_of_month", default: false
    t.string "ce_approve"
    t.time "ce_ap_day_time"
    t.date "ce_ap_date_1"
    t.date "ce_ap_date_2"
    t.string "ce_ap_day_of_week"
    t.boolean "ce_ap_end_of_month", default: false
    t.string "ce_invoice"
    t.time "ce_in_day_time"
    t.date "ce_in_date_1"
    t.date "ce_in_date_2"
    t.string "ce_in_day_of_week"
    t.boolean "ce_in_end_of_month", default: false
    t.index ["company_id"], name: "index_sell_contracts_on_company_id"
    t.index ["contract_id"], name: "index_sell_contracts_on_contract_id"
  end

  create_table "sell_request_documents", force: :cascade do |t|
    t.bigint "sell_contract_id"
    t.string "number"
    t.string "doc_file"
    t.date "when_expire"
    t.boolean "is_sign_required", default: false
    t.string "creatable_type"
    t.bigint "creatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file_name"
    t.integer "file_size"
    t.integer "file_type"
    t.string "request"
    t.index ["creatable_type", "creatable_id"], name: "index_sell_request_documents_on_creatable_type_and_creatable_id"
    t.index ["sell_contract_id"], name: "index_sell_request_documents_on_sell_contract_id"
  end

  create_table "sell_send_documents", force: :cascade do |t|
    t.bigint "sell_contract_id"
    t.string "number"
    t.string "doc_file"
    t.date "when_expire"
    t.boolean "is_sign_required", default: false
    t.string "creatable_type"
    t.bigint "creatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file_name"
    t.integer "file_size"
    t.integer "file_type"
    t.index ["creatable_type", "creatable_id"], name: "index_sell_send_documents_on_creatable_type_and_creatable_id"
    t.index ["sell_contract_id"], name: "index_sell_send_documents_on_sell_contract_id"
  end

  create_table "shared_candidates", force: :cascade do |t|
    t.bigint "candidate_id"
    t.integer "shared_by_id"
    t.integer "shared_to_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["candidate_id"], name: "index_shared_candidates_on_candidate_id"
    t.index ["shared_by_id"], name: "index_shared_candidates_on_shared_by_id"
    t.index ["shared_to_id"], name: "index_shared_candidates_on_shared_to_id"
  end

  create_table "statuses", id: :serial, force: :cascade do |t|
    t.string "statusable_type"
    t.integer "statusable_id"
    t.integer "user_id"
    t.string "note"
    t.integer "status_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "subscriptions", id: :serial, force: :cascade do |t|
    t.integer "company_id"
    t.integer "package_id"
    t.datetime "expiry"
    t.integer "status"
    t.float "amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "taggings", id: :serial, force: :cascade do |t|
    t.integer "tag_id"
    t.string "taggable_type"
    t.integer "taggable_id"
    t.string "tagger_type"
    t.integer "tagger_id"
    t.string "context", limit: 128
    t.datetime "created_at"
    t.index ["context"], name: "index_taggings_on_context"
    t.index ["tag_id", "taggable_id", "taggable_type", "context", "tagger_id", "tagger_type"], name: "taggings_idx", unique: true
    t.index ["tag_id"], name: "index_taggings_on_tag_id"
    t.index ["taggable_id", "taggable_type", "context"], name: "index_taggings_on_taggable_id_and_taggable_type_and_context"
    t.index ["taggable_id", "taggable_type", "tagger_id", "context"], name: "taggings_idy"
    t.index ["taggable_id"], name: "index_taggings_on_taggable_id"
    t.index ["taggable_type"], name: "index_taggings_on_taggable_type"
    t.index ["tagger_id", "tagger_type"], name: "index_taggings_on_tagger_id_and_tagger_type"
    t.index ["tagger_id"], name: "index_taggings_on_tagger_id"
  end

  create_table "tags", id: :serial, force: :cascade do |t|
    t.string "name"
    t.integer "taggings_count", default: 0
    t.index ["name"], name: "index_tags_on_name", unique: true
  end

  create_table "tax_infos", force: :cascade do |t|
    t.bigint "payroll_info_id"
    t.string "tax_term"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["payroll_info_id"], name: "index_tax_infos_on_payroll_info_id"
  end

  create_table "timesheet_approvers", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "timesheet_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "status"
    t.index ["user_id", "timesheet_id"], name: "index_timesheet_approvers_on_user_id_and_timesheet_id"
  end

  create_table "timesheet_logs", id: :serial, force: :cascade do |t|
    t.integer "timesheet_id"
    t.date "transaction_day"
    t.integer "status", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "contract_term_id"
    t.index ["timesheet_id"], name: "index_timesheet_logs_on_timesheet_id"
  end

  create_table "timesheets", id: :serial, force: :cascade do |t|
    t.integer "job_id"
    t.integer "user_id"
    t.integer "company_id"
    t.integer "contract_id"
    t.integer "status", default: 0
    t.float "total_time"
    t.date "start_date"
    t.date "end_date"
    t.date "submitted_date"
    t.date "next_timesheet_created_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "invoice_id"
    t.hstore "days"
    t.string "timesheet_attachment"
    t.string "candidate_name"
    t.integer "candidate_id"
    t.integer "ts_cycle_id"
    t.integer "ta_cycle_id"
    t.text "inv_numbers", default: [], array: true
    t.float "amount"
    t.index ["job_id"], name: "index_timesheets_on_job_id"
  end

  create_table "transactions", id: :serial, force: :cascade do |t|
    t.integer "timesheet_log_id"
    t.datetime "start_time"
    t.datetime "end_time"
    t.integer "total_time", default: 0
    t.integer "status", default: 0
    t.text "memo"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "file"
    t.index ["timesheet_log_id"], name: "index_transactions_on_timesheet_log_id"
  end

  create_table "user_certificates", force: :cascade do |t|
    t.bigint "user_id"
    t.date "end_date"
    t.date "start_date"
    t.string "institute"
    t.string "title"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_user_certificates_on_user_id"
  end

  create_table "user_educations", force: :cascade do |t|
    t.bigint "user_id"
    t.string "degree_level"
    t.string "degree_title"
    t.string "cgpa_grade"
    t.date "completion_year"
    t.date "start_year"
    t.string "institute"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_user_educations_on_user_id"
  end

  create_table "user_work_clients", force: :cascade do |t|
    t.bigint "user_id"
    t.string "name"
    t.string "industry"
    t.date "end_date"
    t.date "start_date"
    t.string "reference_name"
    t.string "reference_phone"
    t.string "reference_email"
    t.text "project_description"
    t.text "role"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_user_work_clients_on_user_id"
  end

  create_table "users", id: :serial, force: :cascade do |t|
    t.integer "company_id"
    t.string "first_name", default: ""
    t.string "last_name", default: ""
    t.integer "gender"
    t.string "email", default: "", null: false
    t.string "type"
    t.string "phone"
    t.integer "primary_address_id"
    t.string "photo"
    t.json "signature"
    t.integer "status"
    t.date "dob"
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer "sign_in_count", default: 0, null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "last_sign_in_ip"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "confirmation_sent_at"
    t.string "unconfirmed_email"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "invitation_token"
    t.datetime "invitation_created_at"
    t.datetime "invitation_sent_at"
    t.datetime "invitation_accepted_at"
    t.integer "invitation_limit"
    t.string "invited_by_type"
    t.integer "invited_by_id"
    t.integer "invitations_count", default: 0
    t.string "skills"
    t.string "ssn"
    t.integer "max_working_hours", default: 28800
    t.string "time_zone"
    t.integer "candidate_id"
    t.datetime "deleted_at"
    t.integer "visa_status"
    t.date "availability"
    t.integer "relocation", default: 0
    t.integer "age"
    t.string "video"
    t.string "resume"
    t.string "video_type"
    t.string "chat_status"
    t.string "temp_pass"
    t.string "ancestry"
    t.index ["ancestry"], name: "index_users_on_ancestry"
    t.index ["deleted_at"], name: "index_users_on_deleted_at"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["invitation_token"], name: "index_users_on_invitation_token", unique: true
    t.index ["invitations_count"], name: "index_users_on_invitations_count"
    t.index ["invited_by_id"], name: "index_users_on_invited_by_id"
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  create_table "vendor_bills", force: :cascade do |t|
    t.integer "vb_cal_cycle_id"
    t.integer "vp_pro_cycle_id"
    t.integer "vb_clr_cycle_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "versions", force: :cascade do |t|
    t.string "item_type", null: false
    t.bigint "item_id", null: false
    t.string "event", null: false
    t.string "whodunnit"
    t.text "object"
    t.datetime "created_at"
    t.index ["item_type", "item_id"], name: "index_versions_on_item_type_and_item_id"
  end

  create_table "visas", force: :cascade do |t|
    t.integer "candidate_id"
    t.string "title"
    t.string "file"
    t.date "exp_date"
    t.string "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "visa_number"
    t.date "start_date"
  end

  add_foreign_key "expense_accounts", "expenses"
end
