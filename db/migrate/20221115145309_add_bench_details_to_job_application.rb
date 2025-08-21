class AddBenchDetailsToJobApplication < ActiveRecord::Migration[5.2]
  def change
    add_column :job_applications, :work_type, :string, nullable: true
    add_column :job_applications, :client_name, :string, nullable: true
    add_column :job_applications, :end_client_job_title, :string, nullable: true
    add_column :job_applications, :client_job_location, :string, nullable: true
    add_column :job_applications, :user_id, :integer, nullable: true
    add_column :job_applications, :company_contact_id, :integer, nullable: true
  end
end
