class CreateContractSellBusinessDetails < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_sell_business_details do |t|
      t.belongs_to :contract, index: true
      t.string :contact_name
      t.string :phone
      t.string :email
      t.string :department

      t.timestamps
    end
  end
end
