class AddOwnerVerifyedToCompanies < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :owner_verified, :boolean, :default=>false
    add_column :companies, :verification_code, :string
  end
end
