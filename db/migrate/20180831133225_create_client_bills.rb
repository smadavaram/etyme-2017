class CreateClientBills < ActiveRecord::Migration[5.1]
  def change
    create_table :client_bills do |t|
      t.integer :cb_cal_cycle_id
      t.integer :cp_pro_cycle_id
      t.integer :cb_clr_cycle_id

      t.timestamps
    end
  end
end
