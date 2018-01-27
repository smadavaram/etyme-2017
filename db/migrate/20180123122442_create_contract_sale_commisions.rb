class CreateContractSaleCommisions < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_sale_commisions do |t|
      t.belongs_to :contract
      t.string :name
      t.decimal :rate
      t.string :frequency
      t.decimal :limit

      t.timestamps
    end
  end
end
