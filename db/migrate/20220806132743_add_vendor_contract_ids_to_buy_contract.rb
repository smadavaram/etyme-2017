class AddVendorContractIdsToBuyContract < ActiveRecord::Migration[5.2]
  def change
    add_column :buy_contracts, :vendor_contacts_ids, :string, array: true, default: []
  end
end
