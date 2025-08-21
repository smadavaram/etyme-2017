class AddInvitationTypeToJobInvitation < ActiveRecord::Migration[4.2]
  def change
    add_column :job_invitations,:invitation_type, :integer
  end
end
