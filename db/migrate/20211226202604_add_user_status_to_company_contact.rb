class AddUserStatusToCompanyContact < ActiveRecord::Migration[5.2]
  def change
    add_column :company_contacts, :user_status, :integer, default: 0
  end
end
