class CreateContractBuyBusinessDetails < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :contract_buy_business_details do |t|
      t.belongs_to :contract, index: true
      t.string :contact_name
      t.string :phone
      t.string :email
      t.string :department

      t.timestamps
    end
  end
end
