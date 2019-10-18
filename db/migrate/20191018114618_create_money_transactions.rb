class CreateMoneyTransactions < ActiveRecord::Migration[5.1]
  def change
    create_table :money_transactions do |t|
      t.references :part_of, polymorphic: true
      t.references :payable, polymorphic: true
      t.bigint :company_id
      t.decimal :previous
      t.decimal :total
      t.decimal :paid
      t.decimal :remaining
    end
  end
end
