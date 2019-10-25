class ChangeBalanceTypesIntoBankDetails < ActiveRecord::Migration[5.1]
  def change
    change_column :bank_details, :balance, :decimal, using: 'balance::float'
    change_column :bank_details, :new_balance, :decimal, using: 'new_balance::float'
    change_column :bank_details, :unidentified_bal, :decimal, using: 'unidentified_bal::float'
    change_column :bank_details, :current_unidentified_bal, :decimal, using: 'current_unidentified_bal::float'
    change_column :bank_details, :company_id, :bigint, using: 'company_id::integer'
  end
end