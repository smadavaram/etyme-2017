class CreateLegalDocuments < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :legal_documents do |t|
      t.integer :candidate_id
      t.string :title
      t.string :file
      t.date :exp_date

      t.timestamps
    end
  end
end
