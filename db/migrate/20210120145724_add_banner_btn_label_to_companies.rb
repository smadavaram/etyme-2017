class AddBannerBtnLabelToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :banner_btn_label, :string
  end
end
