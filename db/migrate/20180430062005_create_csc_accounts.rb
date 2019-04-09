class CreateCscAccounts < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :csc_accounts do |t|
      t.belongs_to :contract_sale_commision
      t.belongs_to :accountable, polymorphic: true

      t.timestamps
    end
  end
end