class CreateDepartments < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :departments do |t|
      t.string :name
      t.timestamps null: false
    end
  end
end