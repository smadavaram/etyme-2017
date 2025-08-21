class CreateCompanies < ActiveRecord::Migration[4.2]
  def change
    create_table :companies do |t|

      t.integer  :owner_id , index: true
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
      t.integer  :status
      t.date     :established_date
      t.integer  :entity_type
      t.integer  :hr_manager_id
      t.integer  :billing_contact_id
      t.string   :accountant_contact_email

      t.timestamps null: false
    end
  end
end
