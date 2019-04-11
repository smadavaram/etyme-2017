class CreateTimesheetLogs < ActiveRecord::Migration[4.2]
  def change
    create_table :timesheet_logs do |t|
      t.integer :timesheet_id
      t.date    :transaction_day
      t.integer :status , default: 0

      t.timestamps null: false
    end
    add_index :timesheet_logs, :timesheet_id
  end
end
