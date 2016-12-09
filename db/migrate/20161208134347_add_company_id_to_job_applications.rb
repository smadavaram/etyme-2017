class AddCompanyIdToJobApplications < ActiveRecord::Migration
  def change
    add_column :job_applications, :company_id, :integer ,foreign_key: true , index: true
    add_column :contracts, :company_id, :integer ,foreign_key: true , index: true
    add_column :job_invitations, :company_id, :integer ,foreign_key: true , index: true
  end
end
