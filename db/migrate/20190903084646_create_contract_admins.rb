class CreateContractAdmins < ActiveRecord::Migration[5.1]
  def change
    create_table :contract_admins do |t|
      t.bigint :user_id
      t.bigint :company_id
      t.bigint :contract_id
      t.timestamps
    end
  end
end
