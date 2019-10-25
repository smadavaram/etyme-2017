class CreateContractTransactions < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_books do |t|
      t.bigint :contract_id
      t.references :bookable, polymorphic: true
      t.references :beneficiary, polymorphic: true
      t.integer :transaction_type
      t.integer :contract_type
      t.decimal :previous
      t.decimal :total
      t.decimal :paid
      t.decimal :remainings
    end
  end
end
