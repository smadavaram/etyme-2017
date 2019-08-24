class AddSignersToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :signers_ids, :string, array: true, default: []
  end
end
