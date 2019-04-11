class AddResumeFieldInJob < ActiveRecord::Migration[4.2]
  def change
    add_column :job_applications , :applicant_resume, :string
  end
end
