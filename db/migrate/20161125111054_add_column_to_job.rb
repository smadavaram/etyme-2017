class AddColumnToJob < ActiveRecord::Migration
  def change
    add_column :jobs, :is_public, :boolean , default: true
  end
end
