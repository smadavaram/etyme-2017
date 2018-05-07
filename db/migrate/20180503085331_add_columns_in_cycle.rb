class AddColumnsInCycle < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_cycles, :status, :string, default: 'pending'
    add_column :contract_cycles, :completed_at, :datetime
    add_column :contract_cycles, :start_date, :datetime
    add_column :contract_cycles, :end_date, :datetime

    add_column :timesheets, :ts_cycle_id, :integer, index: true
    add_column :timesheets, :ta_cycle_id, :integer, index: true
  end
end
