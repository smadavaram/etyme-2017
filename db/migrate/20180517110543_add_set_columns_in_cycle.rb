class AddSetColumnsInCycle < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :contract_cycles, :next_date, :datetime
    add_column :contract_cycles, :next_action, :string
    add_column :contract_cycles, :next_action_date, :datetime
  end
end
