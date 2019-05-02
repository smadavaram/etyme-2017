class AddAttributesToCandidatesCompanies < ActiveRecord::Migration[5.1]
  def change
    unless (column_exists?(:candidates_companies, :status))
      add_column :candidates_companies, :status, :integer
    end
    unless (column_exists?(:candidates_companies, :candidate_status))
      add_column :candidates_companies, :candidate_status, :integer
    end
  end
end