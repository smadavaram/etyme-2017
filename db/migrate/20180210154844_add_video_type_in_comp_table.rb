class AddVideoTypeInCompTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :video_type, :string
  end
end
