class CreateContractCycles < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :contract_cycles do |t|
      t.belongs_to :contract
      t.belongs_to :company
      t.belongs_to :candidate
      t.text :note
      t.string :cycle_type
      t.datetime :cycle_date
      t.references :cyclable, polymorphic: true, index: true

      t.timestamps
    end
  end
end
