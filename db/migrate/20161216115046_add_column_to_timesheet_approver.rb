class AddColumnToTimesheetApprover < ActiveRecord::Migration
  def change
    add_column :timesheet_approvers, :status, :integer
  end
end
