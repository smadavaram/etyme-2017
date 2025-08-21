class AddPrimaryKeyToCandidatesCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates_companies, :id, :primary_key
    remove_index :candidates_companies, name: "index_candidates_companies_on_candidate_id_and_company_id"
  end
end
