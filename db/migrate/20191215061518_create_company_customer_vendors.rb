class CreateCompanyCustomerVendors < ActiveRecord::Migration[5.1]
  def change
    create_table :company_customer_vendors do |t|
      t.references :company, foreign_key: true
      t.string :file
      t.integer :file_type

      t.timestamps
    end
  end
end
