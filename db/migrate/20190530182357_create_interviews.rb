class CreateInterviews < ActiveRecord::Migration[5.1]
  def change
    create_table :interviews do |t|
      t.string :date
      t.string :time
      t.bigint :job_application_id
      t.string :source
      t.string :location
      t.boolean :accept, default: false
      t.boolean :accepted_by_recruiter, default: false
    end
  end
end
