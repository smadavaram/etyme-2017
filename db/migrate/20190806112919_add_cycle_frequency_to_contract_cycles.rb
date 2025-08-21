class AddCycleFrequencyToContractCycles < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_cycles, :cycle_frequency, :bigint
  end
end
