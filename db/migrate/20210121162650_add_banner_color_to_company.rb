class AddBannerColorToCompany < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_color, :string
  end
end
