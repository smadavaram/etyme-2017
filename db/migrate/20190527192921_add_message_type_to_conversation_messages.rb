class AddMessageTypeToConversationMessages < ActiveRecord::Migration[5.1]
  def change
    add_column :conversation_messages, :message_type, :integer
  end
end
