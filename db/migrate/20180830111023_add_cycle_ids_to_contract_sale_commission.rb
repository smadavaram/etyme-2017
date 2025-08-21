class AddCycleIdsToContractSaleCommission < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :contract_sale_commisions, :com_cal_cycle_id, :integer
    add_column :contract_sale_commisions, :com_pro_cycle_id, :integer
    add_column :contract_sale_commisions, :com_clr_cycle_id, :integer
  end
end
