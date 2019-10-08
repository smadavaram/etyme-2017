class AddUserIdToContractCycles < ActiveRecord::Migration[5.1]
  def change
    add_column :contract_cycles, :user_id, :bigint
  end
end
