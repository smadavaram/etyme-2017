class AddAttributesToJobApplications < ActiveRecord::Migration[5.1]
  def change
    add_column :job_applications, :available_from, :string
    add_column :job_applications, :available_to, :string
    add_column :job_applications, :available_to_join, :datetime
    add_column :job_applications, :total_experience, :float
    add_column :job_applications, :relevant_experience, :float
    add_column :job_applications, :rate_per_hour, :float
  end
end
