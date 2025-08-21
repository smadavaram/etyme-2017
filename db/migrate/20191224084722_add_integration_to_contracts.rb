class AddIntegrationToContracts < ActiveRecord::Migration[5.1]
  def change
    add_column :sell_contracts, :integration, :string
    add_column :buy_contracts, :integration, :string
  end
end
