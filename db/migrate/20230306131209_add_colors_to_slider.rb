class AddColorsToSlider < ActiveRecord::Migration[5.2]
  def change
    add_column :sliders, :text_1_color, :string, default: "#fff"
    add_column :sliders, :text_2_color, :string, default: "#fff"
    add_column :sliders, :text_3_color, :string, default: "#fff"
    add_column :sliders, :height, :float, default: 250
  end
end
