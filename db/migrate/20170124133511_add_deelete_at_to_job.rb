class AddDeeleteAtToJob < ActiveRecord::Migration[4.2]
  def change
    add_column :jobs, :deleted_at, :datetime
    add_index :jobs, :deleted_at
  end
end
