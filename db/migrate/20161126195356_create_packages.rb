class CreatePackages < ActiveRecord::Migration[4.2]
  def change
    create_table :packages do |t|
      t.string :name
      t.text :description
      t.integer :duration
      t.float :price
      t.string :slug

      t.timestamps null: false
    end
  end
end
