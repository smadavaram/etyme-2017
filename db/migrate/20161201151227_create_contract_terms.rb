class CreateContractTerms < ActiveRecord::Migration[4.2]
  def change
    create_table :contract_terms do |t|
      t.decimal :rate
      t.text    :note
      t.text    :terms_condition
      t.integer :created_by , index: true
      t.integer :status , default: 0
      t.integer :contract_id
      t.timestamps null: false
    end
    remove_column :contracts ,:terms_conditions
  end
end
