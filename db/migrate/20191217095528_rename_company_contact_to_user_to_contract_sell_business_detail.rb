class RenameCompanyContactToUserToContractSellBusinessDetail < ActiveRecord::Migration[5.1]
  def change
    rename_column :contract_sell_business_details, :company_contact_id, :user_id
  end
end
