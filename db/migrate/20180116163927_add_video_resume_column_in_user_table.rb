class AddVideoResumeColumnInUserTable < ActiveRecord::Migration
  def change
    add_column :users, :video, :string
    add_column :users, :resume, :string
  end
end