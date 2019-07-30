class AddEnvelopIdToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :envelope_id, :string
    add_column :document_signs, :envelope_uri, :string
  end
end
