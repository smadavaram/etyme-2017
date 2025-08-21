class AddColumnInCompanyTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :video, :string
    add_column :companies, :company_file, :string
  end
end