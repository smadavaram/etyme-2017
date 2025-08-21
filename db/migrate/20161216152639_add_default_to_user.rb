class AddDefaultToUser < ActiveRecord::Migration[4.2]
  def change
    change_column_default :users, :max_working_hours, 28800
  end
end
