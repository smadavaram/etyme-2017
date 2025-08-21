class AddContractIdsToConversation < ActiveRecord::Migration[5.1]
  def change
    add_column :conversations, :buy_contract_id, :bigint
    add_column :conversations, :sell_contract_id, :bigint
  end
end
