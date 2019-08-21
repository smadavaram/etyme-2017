class AddRequestedByToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :requested_by_type, :string
    add_column :document_signs, :requested_by_id, :bigint
  end
end
