class AddCompanySubTypeInCompanyTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :company_sub_type, :string
  end
end