class RemoveCompoundIndexFromUsers < ActiveRecord::Migration
  def change
    remove_index :users, [:email , :company_id]
    add_index  :users, [:email], unique: true
  end
end
