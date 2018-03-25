class CreateJobApplicantReqs < ActiveRecord::Migration[5.1]
  def change
    create_table :job_applicant_reqs do |t|
      t.belongs_to :job_application, index: true
      t.belongs_to :job_requirement, index: true
      t.text :applicant_ans
      t.string :app_multi_ans
      t.timestamps
    end
  end
end