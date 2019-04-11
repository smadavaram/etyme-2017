class AddChatStatusField < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :users, :chat_status, :string
    add_column :candidates, :chat_status, :string
  end
end
