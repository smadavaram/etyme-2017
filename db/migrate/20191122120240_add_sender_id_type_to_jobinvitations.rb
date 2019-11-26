class AddSenderIdTypeToJobinvitations < ActiveRecord::Migration[5.1]
  def change
    add_column :job_invitations, :sender_id, :integer
    add_column :job_invitations, :sender_type, :string
  end
end
