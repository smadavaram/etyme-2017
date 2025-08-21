class AddDomainToCompanies < ActiveRecord::Migration[4.2]
  def change
    add_column :companies, :domain, :string
  end
end
