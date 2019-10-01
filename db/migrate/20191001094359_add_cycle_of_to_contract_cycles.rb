class AddCycleOfToContractCycles < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_cycles, :cycle_of_type, :string
    add_column :contract_cycles, :cycle_of_id, :bigint
  end
end
