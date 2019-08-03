class RenameTimeSheetLogIdAtTransactions < ActiveRecord::Migration[5.1]
  def change
    rename_column :transactions,:timesheet_log_id, :timesheet_id
  end
end
