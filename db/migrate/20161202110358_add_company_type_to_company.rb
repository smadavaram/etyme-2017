class AddCompanyTypeToCompany < ActiveRecord::Migration
  def change
    add_column :companies, :company_type, :integer , default: 0
  end
end
