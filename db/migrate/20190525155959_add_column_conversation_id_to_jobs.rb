class AddColumnConversationIdToJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :conversation_id, :bigint
  end
end
