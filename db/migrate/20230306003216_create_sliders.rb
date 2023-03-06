class CreateSliders < ActiveRecord::Migration[5.2]
  def change
    create_table :sliders do |t|
      t.references :company
      t.string :image_1
      t.string :title_1
      t.text :text_1
      t.string :image_2
      t.string :title_2
      t.text :text_2
      t.string :image_3
      t.string :title_3
      t.text :text_3

      t.timestamps
    end
  end
end
