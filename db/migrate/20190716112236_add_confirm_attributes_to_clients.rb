class AddConfirmAttributesToClients < ActiveRecord::Migration[5.1]
  def change
    add_column :clients, :refrence_one, :boolean
    add_column :clients, :refrence_two, :boolean
  end
end
