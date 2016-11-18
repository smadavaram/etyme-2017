class CreateCompanyDocs < ActiveRecord::Migration
  def change
    create_table :company_docs do |t|
      t.string :name
      t.integer :doc_type
      t.integer :created_by
      t.integer :company_id
      t.string :description
      t.string :file
      t.boolean :is_required_signature

      t.timestamps null: false
    end
  end
end
