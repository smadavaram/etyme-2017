class AddColumnToJob < ActiveRecord::Migration[4.2]
  def change
    add_column :jobs, :is_public, :boolean , default: true
  end
end
