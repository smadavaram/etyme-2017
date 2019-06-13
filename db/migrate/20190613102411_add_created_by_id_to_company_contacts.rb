class AddCreatedByIdToCompanyContacts < ActiveRecord::Migration[5.1]
  def change
    add_column :company_contacts, :created_by_id, :bigint
  end
end
