class AddSignaturesToContracts < ActiveRecord::Migration
  def change
    add_column :contracts, :received_by_signature, :json
    add_column :contracts, :received_by_name,      :string
    add_column :contracts, :sent_by_signature,     :json
    add_column :contracts, :sent_by_name,          :string
  end
end
