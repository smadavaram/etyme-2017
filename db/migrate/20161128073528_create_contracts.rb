class CreateContracts < ActiveRecord::Migration
  def change
    create_table :contracts do |t|
      t.integer :job_application_id
      t.integer :job_id
      t.date    :start_date
      t.date    :end_date
      t.text    :terms_conditions
      t.string  :message_from_hiring
      t.string  :response_from_vendor
      t.integer :created_by_id
      t.integer :responed_by_id
      t.string  :responed_at
      t.integer :status
      t.integer :assignee_id

      t.timestamps null: false
    end
  end
end
