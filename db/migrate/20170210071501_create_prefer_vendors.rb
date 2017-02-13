class CreatePreferVendors < ActiveRecord::Migration
  def change
    create_table :prefer_vendors do |t|
      t.integer :company_id
      t.integer :vendor_id
      t.integer :status ,default: 0
      t.timestamps null: false
    end
  end
end
