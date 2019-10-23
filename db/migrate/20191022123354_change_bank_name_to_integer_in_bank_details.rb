class ChangeBankNameToIntegerInBankDetails < ActiveRecord::Migration[5.1]
  def change
  	 change_column :bank_details, :bank_name, :integer, using: 'bank_name::integer'
  end
end
