class AddInvitationPurposeToJobInvitations < ActiveRecord::Migration[5.1]
  def change
    add_column :job_invitations, :invitation_purpose, :integer,default: 0
  end
end
