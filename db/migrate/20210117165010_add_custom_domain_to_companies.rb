class AddCustomDomainToCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :custom_domain, :string
  end
end
