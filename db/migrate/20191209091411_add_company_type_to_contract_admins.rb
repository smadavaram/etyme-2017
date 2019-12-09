class AddCompanyTypeToContractAdmins < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_admins, :contract_admin, :string
  end
end
