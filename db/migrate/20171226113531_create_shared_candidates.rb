class CreateSharedCandidates < ActiveRecord::Migration
  def change
    create_table :shared_candidates do |t|
      t.belongs_to :candidate, index: true
      t.integer :shared_by_id, index: true
      t.integer :shared_to_id, index: true

      t.timestamps null: false
    end
  end
end
