class AddInitiatorToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :initiator_type, :string
    add_column :document_signs, :initiator_id, :bigint
  end
end
