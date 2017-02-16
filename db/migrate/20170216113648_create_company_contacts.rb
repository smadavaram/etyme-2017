class CreateCompanyContacts < ActiveRecord::Migration
  def change
    create_table :company_contacts do |t|
      t.integer :company_id
      t.string  :first_name
      t.string  :last_name
      t.string  :email,              null: false, default: ""
      t.string  :phone
      t.integer :status
      t.timestamps null: false
    end
  end
end
