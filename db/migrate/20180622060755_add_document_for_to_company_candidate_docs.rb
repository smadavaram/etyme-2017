class AddDocumentForToCompanyCandidateDocs < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :company_candidate_docs, :document_for, :string
  end
end
