class AddResumeFieldInJob < ActiveRecord::Migration
  def change
    add_column :job_applications , :applicant_resume, :string
  end
end
