class AddColoumnPhotoToCompanyContacts < ActiveRecord::Migration
  def change
    add_column :company_contacts, :photo, :string
  end
end
