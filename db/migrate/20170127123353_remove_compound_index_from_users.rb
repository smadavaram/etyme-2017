class RemoveCompoundIndexFromUsers < ActiveRecord::Migration[4.2]
  def change
    remove_index :users, [:email , :company_id]
    add_index  :users, [:email], unique: true
  end
end
