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

ActiveRecord::Schema.define(version: 20161103144819) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "companies", force: :cascade do |t|
    t.integer  "owner_id"
    t.string   "company_type_id"
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
    t.boolean  "is_activated",     default: false
    t.string   "dba"
    t.boolean  "status"
    t.date     "established_date"
    t.integer  "entity_type"
    t.datetime "created_at",                       null: false
    t.datetime "updated_at",                       null: false
  end

  add_index "companies", ["owner_id"], name: "index_companies_on_owner_id", using: :btree

  create_table "company_types", force: :cascade do |t|
    t.string   "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "jobs", force: :cascade do |t|
    t.string   "title"
    t.text     "description"
    t.integer  "company_id"
    t.string   "country"
    t.string   "zip_code"
    t.string   "state"
    t.string   "city"
    t.date     "start_date"
    t.date     "end_date"
    t.datetime "created_at",  null: false
    t.datetime "updated_at",  null: false
  end

  create_table "prefferd_vendors", id: false, force: :cascade do |t|
    t.integer  "company_id"
    t.integer  "vendor_id"
    t.boolean  "status",     default: false
    t.datetime "created_at",                 null: false
    t.datetime "updated_at",                 null: false
  end

  add_index "prefferd_vendors", ["company_id"], name: "index_prefferd_vendors_on_company_id", using: :btree
  add_index "prefferd_vendors", ["vendor_id"], name: "index_prefferd_vendors_on_vendor_id", using: :btree

  create_table "devise", force: :cascade do |t|
    t.string   "first_name",             default: ""
    t.string   "last_name",              default: ""
    t.boolean  "gender"
    t.string   "email",                  default: "", null: false
    t.string   "type"
    t.string   "contact"
    t.string   "country"
    t.string   "state"
    t.string   "city"
    t.string   "zip_code"
    t.string   "photo"
    t.boolean  "status"
    t.string   "encrypted_password",     default: "", null: false
    t.string   "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.integer  "sign_in_count",          default: 0,  null: false
    t.datetime "current_sign_in_at"
    t.datetime "last_sign_in_at"
    t.string   "current_sign_in_ip"
    t.string   "last_sign_in_ip"
    t.datetime "created_at",                          null: false
    t.datetime "updated_at",                          null: false
  end

  add_index "devise", ["email"], name: "index_users_on_email", unique: true, using: :btree
  add_index "devise", ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true, using: :btree

end
