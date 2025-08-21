class AddColoumnTitleToCompanyContacts < ActiveRecord::Migration[4.2]
  def change
    add_column :company_contacts, :title, :string
  end
  add_index(:company_contacts, [:company_id, :email], unique: true)
end
