class AddOtherFieldsToCompanyCandidateDocs < ActiveRecord::Migration[5.1]
  def change
    add_column :company_candidate_docs, :title_type, :string
    add_column :company_candidate_docs, :is_require, :string
  end
end
