class AddJobIdToConversations < ActiveRecord::Migration[5.1]
  def change
    add_column :conversations, :job_id, :bigint
  end
end
