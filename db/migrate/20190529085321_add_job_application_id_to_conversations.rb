class AddJobApplicationIdToConversations < ActiveRecord::Migration[5.1]
  def change
    add_column :conversations, :job_application_id, :bigint
  end
end
