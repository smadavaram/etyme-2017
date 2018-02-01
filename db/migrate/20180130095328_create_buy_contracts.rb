class CreateBuyContracts < ActiveRecord::Migration[5.1]
  def change
    create_table :buy_contracts do |t|
      t.string :number
      t.belongs_to :contract
      t.integer :candidate_id, index: true
      t.text :ssn
      t.string :contract_type
      t.decimal :payrate
      t.string :payrate_type
      t.string :time_sheet
      t.string :payment_term
      t.boolean :show_accounting_to_employee

      t.timestamps
    end
  end
end
