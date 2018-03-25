class CreateClients < ActiveRecord::Migration[5.1]
  def change
    create_table :clients do |t|
      t.belongs_to :candidate, index: true
      t.string :name
      t.string :industry
      t.date :start_date
      t.date :end_date
      t.string :project_description
      t.string :role
      t.string :refrence_name
      t.string :refrence_phone
      t.string :refrence_email
      t.timestamps null: false
    end
  end
end