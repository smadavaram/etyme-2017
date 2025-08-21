class AddParentContractIdToContract < ActiveRecord::Migration[4.2]
  def change
    add_column :contracts, :parent_contract_id, :integer , index: true , foreign_key: true
  end
end
