class CreateVendorBills < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :vendor_bills do |t|
      t.integer :vb_cal_cycle_id
      t.integer :vp_pro_cycle_id
      t.integer :vb_clr_cycle_id

      t.timestamps
    end
  end
end
