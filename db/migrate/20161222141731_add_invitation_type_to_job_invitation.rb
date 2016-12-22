class AddInvitationTypeToJobInvitation < ActiveRecord::Migration
  def change
    add_column :job_invitations,:invitation_type, :integer
  end
end
