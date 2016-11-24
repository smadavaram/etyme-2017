class AddColumnToJobInvitation < ActiveRecord::Migration
  def change
    add_column :job_invitations, :cover_letter, :text
    add_column :job_invitations, :message, :string
  end
end
