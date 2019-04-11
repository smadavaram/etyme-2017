class AddContractTypeToContracts < ActiveRecord::Migration[4.2]
  def change
    add_column :contracts, :contract_type, :integer
    change_column :contracts, :time_sheet_frequency, :integer , default: :null
    change_column :contracts, :billing_frequency, :integer , default: :null
    change_column :contracts, :commission_type, :integer , default: :null

  end
end
