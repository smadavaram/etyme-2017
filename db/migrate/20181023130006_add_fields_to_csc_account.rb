class AddFieldsToCscAccount < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :csc_accounts, :total_amount, :decimal, default: "0.0"
    add_column :csc_accounts, :contract_id, :integer
  end
end
