class AddShowSliderIntoCompany < ActiveRecord::Migration[5.2]
  def change
    add_column :companies, :show_slider, :boolean, default: false
  end
end
