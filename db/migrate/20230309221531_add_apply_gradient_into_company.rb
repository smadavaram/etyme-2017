class AddApplyGradientIntoCompany < ActiveRecord::Migration[5.2]
  def change
    add_column :companies, :apply_gradient, :boolean, default: true
  end
end
