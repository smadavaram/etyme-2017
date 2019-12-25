class AddRoleToContractAdmins < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_admins, :role, :integer
  end
end
