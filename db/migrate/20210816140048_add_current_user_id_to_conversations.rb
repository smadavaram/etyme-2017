class AddCurrentUserIdToConversations < ActiveRecord::Migration[5.2]
  def change
    add_column :conversations, :current_user_id, :integer
  end
end
