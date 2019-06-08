class AddAcceptRateToJobApplications < ActiveRecord::Migration[5.1]
  def change
    add_column :job_applications, :accept_rate, :boolean, default: false
    add_column :job_applications, :accept_rate_by_company, :boolean, default: false
  end
end
