class RemoveIndexFromCandidate < ActiveRecord::Migration
  def change
    remove_index :candidates, column: [:email]
  end
end
