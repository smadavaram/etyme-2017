class AddIsClientCustomerToContracts < ActiveRecord::Migration[5.1]
  def change
    add_column :contracts, :is_client_customer, :boolean
  end
end
