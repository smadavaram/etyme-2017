class AddPartOfToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :part_of_type, :string
    add_column :document_signs, :part_of_id, :integer
  end
end
