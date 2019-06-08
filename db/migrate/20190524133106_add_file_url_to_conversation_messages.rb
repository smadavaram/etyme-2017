class AddFileUrlToConversationMessages < ActiveRecord::Migration[5.1]
  def change
    add_column :conversation_messages, :file_url, :string
  end
end
