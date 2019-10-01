class ChangeStatusTypeInContractCycles < ActiveRecord::Migration[5.1]
  def change
    remove_column :contract_cycles, :status
    add_column :contract_cycles, :status,:integer, default: 0, using: "status::integer"
  end
end
