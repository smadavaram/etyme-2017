class AddPorposalChatIdToConversations < ActiveRecord::Migration[5.2]
  def change
    add_column :conversations, :porposal_chat_id, :integer
    add_column :conversations, :candidate_id, :integer
    add_column :conversations, :recruiter_id, :integer
  end
end
