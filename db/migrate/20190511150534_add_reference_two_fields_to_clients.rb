class AddReferenceTwoFieldsToClients < ActiveRecord::Migration[5.1]
  def change
    add_column :clients, :refrence_two_name, :string
    add_column :clients, :refrence_two_email, :string
    add_column :clients, :refrence_two_phone, :string
  end
end