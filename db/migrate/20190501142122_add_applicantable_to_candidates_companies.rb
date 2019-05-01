class AddApplicantableToCandidatesCompanies < ActiveRecord::Migration[5.1]
  def change
    add_column  :candidates_companies, :applicantable_id, :bigint
    add_column  :candidates_companies, :applicantable_type, :string
  end
end
