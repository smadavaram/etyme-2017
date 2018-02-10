class AddVideoResumeColumnInUserTable < ActiveRecord::Migration[5.1]
  def change
    add_column :users, :video, :string
    add_column :users, :resume, :string
  end
end