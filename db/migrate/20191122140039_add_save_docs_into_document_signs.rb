class AddSaveDocsIntoDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :save_doc_type, :string
    add_column :document_signs,:save_doc_id,:bigint
  end
end
