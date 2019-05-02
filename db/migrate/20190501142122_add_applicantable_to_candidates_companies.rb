class AddApplicantableToCandidatesCompanies < ActiveRecord::Migration[5.1]
  def change
    rename_column :candidates_companies, :candidate_id,:applicantable_id
    add_column :candidates_companies, :applicantable_type, :string
    add_column :candidates_companies, :id, :primary_key
    begin
      CandidatesCompany.update_all(applicantable_type: 'Candidate')
    rescue Exception => e
      puts e
    end
  end
end
