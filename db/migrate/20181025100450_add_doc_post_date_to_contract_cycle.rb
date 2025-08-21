class AddDocPostDateToContractCycle < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :contract_cycles, :doc_date, :date
    add_column :contract_cycles, :post_date, :date
  end
end
