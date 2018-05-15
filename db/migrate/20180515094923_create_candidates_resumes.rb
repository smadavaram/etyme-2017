class CreateCandidatesResumes < ActiveRecord::Migration[5.1]
  def change
    create_table :candidates_resumes do |t|
      t.integer :candidate_id
      t.string :resume
      t.boolean :is_primary, :default=> false

      t.timestamps
    end
  end
end
