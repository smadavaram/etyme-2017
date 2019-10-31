class CreateCommissionQueues < ActiveRecord::Migration[5.1]
  def change
    create_table :commission_queues do |t|
      t.bigint :contract_sale_commision_id
      t.integer :status
      t.bigint :buy_contract_id
      t.bigint :salary_id
      t.decimal :total_amount
      t.timestamps
    end
  end
end
