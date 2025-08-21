class AddResourceIdToConversationMessages < ActiveRecord::Migration[5.1]
  def change
    add_column :conversation_messages, :resource_id, :bigint
  end
end
