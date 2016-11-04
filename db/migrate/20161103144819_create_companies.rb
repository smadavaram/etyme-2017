class CreateCompanies < ActiveRecord::Migration
  def change
    create_table :companies do |t|

      t.integer :owner_id , index: true

      t.string  :company_type_id
      t.string   :name
      t.string   :website
      t.string   :logo
      t.text     :description
      t.string   :phone
      t.string   :email
      t.string   :slug
      t.string   :tag_line
      t.string   :linkedin_url
      t.string   :facebook_url
      t.string   :twitter_url
      t.string   :google_url
      t.string   :time_zone
      t.boolean  :is_activated,    default: false
      t.string   :dba
      t.boolean  :status
      t.date     :established_date
      t.integer  :entity_type
      # t.string  :country
      # t.string  :state
      # t.string  :city
      # t.string  :zip_code



   # t.integer  "hr_contact_id",             limit: 4
   # t.integer  "billing_contact_id",        limit: 4
   # t.string   "accountant_contact_email",  limit: 255

   t.timestamps null: false
    end
  end
end
