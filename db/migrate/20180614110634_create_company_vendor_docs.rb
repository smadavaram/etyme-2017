class CreateCompanyVendorDocs < ActiveRecord::Migration[5.1]
  def change
    create_table :company_vendor_docs do |t|
      t.integer :company_id
      t.string :title
      t.string :file
      t.date :exp_date
      t.boolean :is_required_signature, :default=>false
      t.integer :created_by

      t.timestamps
    end
  end
end
