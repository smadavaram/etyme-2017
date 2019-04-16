class AddAddressColumnInCandidate < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :address, :string, default: nil
  end
end
