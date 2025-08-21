class CreateTransactions < ActiveRecord::Migration[4.2]
  def change
    create_table :transactions do |t|
      t.integer :timesheet_log_id
      t.datetime :strat_time
      t.datetime :end_time
      t.float    :total_time
      t.integer  :status  , default: 0
      t.text     :memo
      t.timestamps null: false
    end
    add_index :transactions, :timesheet_log_id
  end
end
