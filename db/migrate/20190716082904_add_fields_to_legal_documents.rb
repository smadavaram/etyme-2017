class AddFieldsToLegalDocuments < ActiveRecord::Migration[5.1]
  def change
    add_column :legal_documents, :document_number, :string
    add_column :legal_documents, :start_date, :Date
  end
end
