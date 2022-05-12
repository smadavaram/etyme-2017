class CreateClientReference < ActiveRecord::Migration[5.2]
  def change
    create_table :client_references do |t|
      t.string :name
      t.string :email
      t.string :country_code
      t.string :phone
      t.belongs_to :designation
      t.timestamps
    end
  end
end
