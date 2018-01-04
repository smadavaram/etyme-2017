class AddVideoFieldInJob < ActiveRecord::Migration
  def change
    add_column :jobs, :video_file, :string
  end
end
