class AddCompanyRoleToDesignations < ActiveRecord::Migration[5.1]
  def change
    add_column :designations, :company_role, :string
  end
end
