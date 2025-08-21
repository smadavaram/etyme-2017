class AddCompanyDocIdToMessage < ActiveRecord::Migration[4.2]
  def change
    add_column :messages, :company_doc_id , :integer
    add_column :messages, :file_status    , :integer ,default: 0
  end
end
