class RemoveIndexFromCandidate < ActiveRecord::Migration[4.2]
  def change
    remove_index :candidates, column: [:email]
  end
end
