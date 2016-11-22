class AddExpiryToJobInvitation < ActiveRecord::Migration
  def change
    add_column :job_invitations, :expiry, :date
  end
end
