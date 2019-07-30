class AddSignedFileToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :signed_file, :string
  end
end
