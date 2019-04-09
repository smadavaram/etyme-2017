class CreateDocuments < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :documents do |t|
      t.integer :candidate_id
      t.string :title
      t.string :file
      t.date :exp_date
      t.boolean :is_education, :default=> false
      t.boolean :is_legal_doc, :default=> false

      t.timestamps
    end
  end
end
