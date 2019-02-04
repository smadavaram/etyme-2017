class CreateChangeRates < ActiveRecord::Migration[5.1]
  def change
    create_table :change_rates do |t|
      t.integer :contract_id
      t.date :from_date
      t.date :to_date
      t.string :rate_type
      t.float :rate

      t.timestamps
    end
  end
end
