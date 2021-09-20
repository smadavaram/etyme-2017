class AddOnlineUserStatusToUsers < ActiveRecord::Migration[5.2]
  def change
    add_column :users, :online_user_status, :string
  end
end
