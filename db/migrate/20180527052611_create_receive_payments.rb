class CreateReceivePayments < ActiveRecord::Migration[5.1]
  def change
    create_table :receive_payments do |t|
      t.belongs_to :invoice
      t.datetime :payment_date
      t.string :payment_method
      t.string :reference_no
      t.string :deposit_to
      t.decimal :amount_received, default: 0.0
      t.text :memo
      t.boolean :posted_as_discount, default: false
      t.string :attachment

      t.timestamps
    end
    
    add_column :invoices, :balance, :decimal, default: 0.0
  end
end
