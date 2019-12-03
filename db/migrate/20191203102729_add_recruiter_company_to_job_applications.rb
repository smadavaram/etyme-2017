class AddRecruiterCompanyToJobApplications < ActiveRecord::Migration[5.1]
  def change
    add_column :job_applications, :recruiter_company_id, :integer
  end
end
