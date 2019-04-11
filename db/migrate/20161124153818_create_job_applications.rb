class CreateJobApplications < ActiveRecord::Migration[4.2]
  def change
    create_table :job_applications do |t|
      t.integer :job_invitation_id , foreign_key: true
      t.text    :cover_letter
      t.string  :message
      t.integer :status , default: 0
      t.timestamps null: false
    end
  end
end
