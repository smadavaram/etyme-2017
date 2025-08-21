class AddSecondBannerToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_two_btn_label, :string
    add_column :companies, :banner_two_btn_url, :string
  end
end
