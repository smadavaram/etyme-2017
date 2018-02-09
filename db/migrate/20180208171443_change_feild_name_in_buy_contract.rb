class ChangeFeildNameInBuyContract < ActiveRecord::Migration[5.1]
  def change
    rename_column :buy_contracts, :ssn, :encrypted_ssn
  end
end
