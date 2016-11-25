class AddExpiryToJobInvitation < ActiveRecord::Migration
  def change
    add_column :job_invitations, :expiry, :date
    add_column :job_invitations, :message, :string
  end
end
