class AddCandidateIdToUser < ActiveRecord::Migration[4.2]
  def change
    add_column :users, :candidate_id, :integer , foreign_key: true
    remove_index :users, [:email]
    add_index  :users, [:email, :company_id], unique: true
  end
end
