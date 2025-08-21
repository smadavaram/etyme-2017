class AddBannerBtnUrlToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_btn_url, :string
  end
end
