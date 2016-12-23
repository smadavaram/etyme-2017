class AddResponseMessageToJobInvitations < ActiveRecord::Migration
  def change
    add_column :job_invitations,:response_message, :text
  end
end
