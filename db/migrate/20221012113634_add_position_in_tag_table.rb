class AddPositionInTagTable < ActiveRecord::Migration[5.2]
  def change
    add_column :taggings, :position, :Integer, default: 0
  end
end
