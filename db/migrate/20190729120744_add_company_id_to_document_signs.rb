class AddCompanyIdToDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    add_column :document_signs, :company_id, :bigint
  end
end
