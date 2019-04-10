class AddCompanyRoleToDesignations < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :designations, :company_role, :string
  end
end
