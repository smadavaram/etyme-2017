class AddDescriptionnToJobInvitation < ActiveRecord::Migration
  def change
    add_column :job_invitations, :description, :string
  end
end
