class CreateUserDocs < ActiveRecord::Migration
  def change
    create_table :user_docs do |t|
      t.integer :company_doc_id
      t.integer :user_id
      t.string :description
      t.string :file

      t.timestamps null: false
    end
  end
end
