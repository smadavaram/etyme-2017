class CreateTimesheetApprovers < ActiveRecord::Migration
  def change
    create_table :timesheet_approvers do |t|
      t.integer :user_id
      t.integer :timesheet_id

      t.timestamps null: false
    end
    add_index :timesheet_approvers, [:user_id , :timesheet_id]
  end
end
