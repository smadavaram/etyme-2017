class CreatePrefferdVendors < ActiveRecord::Migration
  def change
    create_table :prefferd_vendors , id: false do |t|
      t.integer :company_id , index: true
      t.integer :vendor_id , index: true
      t.boolean :status , default: false
      t.timestamps null: false
    end
  end
end
