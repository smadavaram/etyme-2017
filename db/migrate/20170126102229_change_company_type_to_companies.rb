class ChangeCompanyTypeToCompanies < ActiveRecord::Migration
  def change
    change_column :companies , :company_type,:integer,default: :null
  end
end
