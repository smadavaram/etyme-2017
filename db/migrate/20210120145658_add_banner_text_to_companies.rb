class AddBannerTextToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_text, :string
  end
end
