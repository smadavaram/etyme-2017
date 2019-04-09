class ChangeCompanyTypeToCompanies < ActiveRecord::Migration[4.2]
  def change
    change_column :companies , :company_type,:integer,default: :null
  end
end
