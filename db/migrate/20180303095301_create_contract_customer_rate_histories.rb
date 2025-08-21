class CreateContractCustomerRateHistories < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :contract_customer_rate_histories do |t|
      t.belongs_to :sell_contract
      t.decimal :customer_rate
      t.date :change_date

      t.timestamps
    end
  end
end
``