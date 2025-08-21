# t.references :company
# t.string :image_1
# t.string :title_1
# t.text :text_1
# t.string :image_2
# t.string :title_2
# t.text :text_2
# t.string :image_3
# t.string :title_3
# t.text :text_3
class Slider < ApplicationRecord
  belongs_to :company
end
