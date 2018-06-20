class AddOtherFieldsToCompanyVendorDocs < ActiveRecord::Migration[5.1]
  def change
    add_column :company_vendor_docs, :title_type, :string
    add_column :company_vendor_docs, :is_require, :string
  end
end
