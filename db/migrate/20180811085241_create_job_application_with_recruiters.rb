class CreateJobApplicationWithRecruiters < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :job_application_with_recruiters do |t|
      t.string :first_name
      t.string :last_name
      t.string :email
      t.string :phone
      t.string :location
      t.string :skill
      t.string :visa
      t.string :title
      t.string :roal
      t.string :resume
      t.integer :job_application_id
      t.boolean :is_registerd
      t.string :recruiter_email

      t.timestamps
    end
  end
end
