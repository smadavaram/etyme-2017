class AddContractableToContract < ActiveRecord::Migration[4.2]
  def change
    add_column :contracts, :contractable_id, :integer
    add_column :contracts, :contractable_type, :string
  end
end
