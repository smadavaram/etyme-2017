class AddSubChatsToConversations < ActiveRecord::Migration[5.2]
  def change
    add_column :conversations, :sub_chats, :boolean, default: false
    add_column :conversations, :main_chat_ids, :integer
    add_column :conversations, :freeze_chats, :boolean, default: false
  end
end