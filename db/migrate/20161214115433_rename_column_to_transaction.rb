class RenameColumnToTransaction < ActiveRecord::Migration[4.2]
  def change
    rename_column :transactions, :strat_time, :start_time
  end
end
