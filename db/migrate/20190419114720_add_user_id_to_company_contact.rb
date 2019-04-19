class AddUserIdToCompanyContact < ActiveRecord::Migration[5.1]
  def change
    add_column :company_contacts, :user_id, :bigint
  end
end
