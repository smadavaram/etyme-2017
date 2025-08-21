class AddColoumnPhotoToCompanyContacts < ActiveRecord::Migration[4.2]
  def change
    add_column :company_contacts, :photo, :string
  end
end
