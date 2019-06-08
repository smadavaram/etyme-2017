class AddRateInitiatorToJobApplications < ActiveRecord::Migration[5.1]
  def change
    add_column :job_applications, :rate_initiator, :string
  end
end
