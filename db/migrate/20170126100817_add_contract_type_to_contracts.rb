class AddContractTypeToContracts < ActiveRecord::Migration
  def change
    add_column :contracts, :contract_type, :integer
    change_column_default(:contracts, :billing_frequency, nil)
    change_column_default(:contracts, :time_sheet_frequency, nil)
  end
end
