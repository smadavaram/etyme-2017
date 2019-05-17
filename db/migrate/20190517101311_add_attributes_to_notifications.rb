class AddAttributesToNotifications < ActiveRecord::Migration[5.1]
  def change
    add_column :notifications, :createable_type, :string
    add_column :notifications, :createable_id, :bigint
  end
end
