class RemoveDescriptionFromCompanyDoc < ActiveRecord::Migration[4.2]
  def change
    remove_column :company_docs, :description, :string
  end
end
