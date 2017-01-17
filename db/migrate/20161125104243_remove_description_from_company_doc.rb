class RemoveDescriptionFromCompanyDoc < ActiveRecord::Migration
  def change
    remove_column :company_docs, :description, :string
  end
end
