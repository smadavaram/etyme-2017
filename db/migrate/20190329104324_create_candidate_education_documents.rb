class CreateCandidateEducationDocuments < ActiveRecord::Migration[5.1]
  def change
    create_table :candidate_education_documents do |t|
      t.integer :education_id
      t.string :title
      t.string :file
      t.date :exp_date
      t.timestamps
    end
  end
end
