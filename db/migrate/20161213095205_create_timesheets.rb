class CreateTimesheets < ActiveRecord::Migration[4.2]
  def change
    create_table :timesheets do |t|

      t.integer     :job_id , index: true
      t.integer     :user_id
      t.integer     :company_id
      t.integer     :contract_id
      t.integer     :status  , default: 0
      t.float       :total_time
      t.date        :start_date
      t.date        :end_date
      t.date        :submitted_date
      t.date        :next_timesheet_created_date
      t.timestamps null: false
    end
  end
end
