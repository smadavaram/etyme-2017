class CreateCompanyLegalDocs < ActiveRecord::Migration[5.1]
  def change
    create_table :company_legal_docs do |t|
      t.integer :company_id
      t.string :title
      t.string :file
      t.date :exp_date
      t.string :custome_name

      t.timestamps
    end
  end
end
