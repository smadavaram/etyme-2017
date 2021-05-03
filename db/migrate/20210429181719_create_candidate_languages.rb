class CreateCandidateLanguages < ActiveRecord::Migration[5.1]
  def self.up
    create_table :candidate_languages do |t|
      t.belongs_to :candidate
      t.string :language_name
      t.string :language_level

      t.timestamps
    end
  end
  def self.down
    drop_table :candidate_languages
  end
end
