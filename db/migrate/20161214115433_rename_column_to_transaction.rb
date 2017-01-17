class RenameColumnToTransaction < ActiveRecord::Migration
  def change
    rename_column :transactions, :strat_time, :start_time
  end
end
