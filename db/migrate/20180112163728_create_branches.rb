class CreateBranches < ActiveRecord::Migration[5.1]
  def change
    create_table :branches do |t|
      t.belongs_to :company, index: true
      t.string :branch_name
      t.string :address
      t.string :city
      t.string :country
      t.string :zip
      t.timestamps null: false
    end
  end
end