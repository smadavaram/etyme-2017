class AddRateAbleToChangeRates < ActiveRecord::Migration[5.1]
  def change
    rename_column :change_rates, :contract_id, :rateable_id
    add_column :change_rates, :rateable_type, :string
    # change_column :change_rates, :rate_type, :integer, default: 0, using: 'rate_type::integer'
  end
end
