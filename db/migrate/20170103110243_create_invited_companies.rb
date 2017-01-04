class CreateInvitedCompanies < ActiveRecord::Migration
  def change
    create_table :invited_companies do |t|
      t.integer :user_id , index: true , foreign_key: true
      t.integer :invited_company_id , index: true , foreign_key: true
      t.integer :invited_by_company_id , index: true , foreign_key: true

      t.timestamps null: false
    end
  end
end
