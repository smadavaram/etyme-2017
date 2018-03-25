class CreateSellContracts < ActiveRecord::Migration[5.1]
  def change
    create_table :sell_contracts do |t|
      t.string :number
      t.belongs_to :contract
      t.integer :company_id, index: true
      t.decimal :customer_rate, default: 0.0
      t.string :customer_rate_type
      t.string :time_sheet
      t.string :invoice_terms_period
      t.boolean :show_accounting_to_employee

      t.timestamps
    end
  end
end
