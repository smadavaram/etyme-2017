class AddVideoFieldInJob < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :video_file, :string
  end
end
