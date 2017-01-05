class AddCandidateIdToUser < ActiveRecord::Migration
  def change
    add_column :users, :candidate_id, :integer , foreign_key: true
    remove_index :users, [:email]
    add_index  :users, [:email, :company_id], unique: true
  end
end
