class CreateCompaniesCandidates < ActiveRecord::Migration[4.2]
  def change
    create_table :candidates_companies ,id: false  do |t|
      t.belongs_to :candidate
      t.belongs_to :company
    end
    add_index :candidates_companies , [:candidate_id , :company_id] , unique: true
  end
end
