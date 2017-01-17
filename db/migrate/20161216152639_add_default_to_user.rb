class AddDefaultToUser < ActiveRecord::Migration
  def change
    change_column_default :users, :max_working_hours, 28800
  end
end
