class CreateAddresses < ActiveRecord::Migration[4.2]
  def change
    create_table :addresses do |t|

      t.string :address_1
      t.string :address_2

      t.string :country
      t.string :city
      t.string :state
      t.string :zip_code

      t.timestamps null: false
    end
  end
end
