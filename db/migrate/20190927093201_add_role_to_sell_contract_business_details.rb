class AddRoleToSellContractBusinessDetails < ActiveRecord::Migration[5.1]
  def change
  	add_column :contract_sell_business_details, :role, :integer, default: 0
  end
end

