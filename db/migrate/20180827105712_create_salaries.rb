class CreateSalaries < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :salaries do |t|
      t.integer :contract_id
      t.integer :company_id
      t.integer :candidate_id
      t.date :start_date
      t.date :end_date
      t.integer :status
      t.integer :sc_cycle_id
      t.integer :sp_cycle_id
      t.integer :sclr_cycle_id

      t.timestamps
    end
  end
end
