class AddCompanyTypeToCompany < ActiveRecord::Migration[4.2]
  def change
    add_column :companies, :company_type, :integer , default: 0
  end
end
