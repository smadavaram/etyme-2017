class AddContractableToContract < ActiveRecord::Migration
  def change
    add_column :contracts, :contractable_id, :integer
    add_column :contracts, :contractable_type, :string
  end
end
