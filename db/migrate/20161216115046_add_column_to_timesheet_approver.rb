class AddColumnToTimesheetApprover < ActiveRecord::Migration[4.2]
  def change
    add_column :timesheet_approvers, :status, :integer
  end
end
