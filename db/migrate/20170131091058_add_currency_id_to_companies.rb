class AddCurrencyIdToCompanies < ActiveRecord::Migration
  def change
    add_column :companies, :currency_id, :integer
  end
end
