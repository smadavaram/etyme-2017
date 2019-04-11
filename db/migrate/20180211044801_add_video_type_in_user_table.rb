class AddVideoTypeInUserTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :users, :video_type, :string
  end
end
