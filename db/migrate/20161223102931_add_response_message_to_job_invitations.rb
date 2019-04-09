class AddResponseMessageToJobInvitations < ActiveRecord::Migration[4.2]
  def change
    add_column :job_invitations,:response_message, :text
  end
end
