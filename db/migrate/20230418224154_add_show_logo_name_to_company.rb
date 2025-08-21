class AddShowLogoNameToCompany < ActiveRecord::Migration[5.2]
  def change
    add_column :companies, :show_name_logo, :integer, default: 0
  end
end
