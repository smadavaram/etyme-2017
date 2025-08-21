class AddOtherFieldsToCompanyCustomerDocs < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :company_customer_docs, :title_type, :string
    add_column :company_customer_docs, :is_require, :string
  end
end
