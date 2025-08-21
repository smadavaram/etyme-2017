class CreateExpenses < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :expenses do |t|
      t.integer :contract_id
      t.integer :account_id
      t.text :mailing_address
      t.string :terms
      t.date :bill_date
      t.date :due_date
      t.string :bill_no
      t.string :total_amount

      t.timestamps
    end
  end
end
