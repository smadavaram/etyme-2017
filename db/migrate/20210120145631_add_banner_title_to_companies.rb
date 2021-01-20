class AddBannerTitleToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_title, :string
  end
end
