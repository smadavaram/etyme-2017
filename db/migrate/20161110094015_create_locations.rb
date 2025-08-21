class CreateLocations < ActiveRecord::Migration[4.2]
  def change
    create_table :locations do |t|

      t.string  :name
      t.integer :address_id
      t.integer :company_id
      t.integer :status

      t.timestamps null: false
    end
  end
end
