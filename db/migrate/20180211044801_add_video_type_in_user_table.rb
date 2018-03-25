class AddVideoTypeInUserTable < ActiveRecord::Migration[5.1]
  def change
    add_column :users, :video_type, :string
  end
end
