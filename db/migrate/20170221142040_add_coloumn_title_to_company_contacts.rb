class AddColoumnTitleToCompanyContacts < ActiveRecord::Migration
  def change
    add_column :company_contacts, :title, :string
  end
  add_index(:company_contacts, [:company_id, :email], unique: true)
end
