class CreateBankDetails < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :bank_details do |t|
      t.string :company_id
      t.string :bank_name
      t.string :balance
      t.string :new_balance
      t.date :recon_date
      t.string :unidentified_bal
      t.string :current_unidentified_bal

      t.timestamps
    end
  end
end
