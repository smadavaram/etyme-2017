class AddCurrencyIdToCompanies < ActiveRecord::Migration[4.2]
  def change
    add_column :companies, :currency_id, :integer
  end
end
