class CreateImportCompanyCustomerVendors < ActiveRecord::Migration[5.1]
  def change
    create_table :import_company_customer_vendors do |t|
      t.references :company, foreign_key: true
      t.string :file
      t.string :file_type

      t.timestamps
    end
  end
end
